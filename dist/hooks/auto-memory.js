/**
 * Auto-Memory Hooks
 *
 * Ported from openclaw/openclaw extensions/memory-lancedb/index.ts L500-684
 * Provides before_prompt_build (auto-recall), agent_end (auto-capture),
 * and session_end (cursor cleanup) hooks.
 *
 * Design decisions:
 * - autoCapture/autoRecall default false (灰度原则)
 * - Memory sub-session anti-recursion: sessionKey with reflection/distiller/dreaming prefix → skip
 * - Recall timeout: 3s (fail-safe, don't stall agent startup)
 * - Capture cap: max 3 memories per agent_end
 */

import { sanitizeForMemoryCapture, dropMediaNoteLines } from '../capture/sanitization.js';
import {
  extractLatestUserText,
  normalizeRecallQuery,
  messageFingerprint,
  resolveAutoCaptureStartIndex,
  shouldCapture,
  detectCategory,
  DEFAULT_CAPTURE_MAX_CHARS,
  DEFAULT_RECALL_MAX_CHARS,
} from '../capture/policy.js';
import {
  cleanMemorySearchResults,
  formatRelevantMemoriesContext,
} from '../capture/prompt-defense.js';
import { findCleanDuplicateMemory } from '../capture/dedup.js';

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_AUTO_RECALL_TIMEOUT_MS = 3000;
const DEFAULT_AUTO_RECALL_OVERFETCH_LIMIT = 10;
const DEFAULT_AUTO_RECALL_RESULT_CAP = 3;
const MAX_CAPTURE_PER_TURN = 3;

/**
 * Session key prefixes that indicate plugin-internal sub-sessions.
 * These should be skipped to prevent recursive capture/recall.
 * Pre-embedded for M3/M4 (reflection/distiller/dreaming).
 */
const MEMORY_SUBSESSION_PREFIXES = [
  'memory:',
  'reflection:',
  'distiller:',
  'dreaming:',
];

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Check if a sessionKey belongs to a memory sub-session (anti-recursion guard).
 */
function isMemorySubSession(sessionKey) {
  if (!sessionKey) return false;
  return MEMORY_SUBSESSION_PREFIXES.some(prefix => sessionKey.startsWith(prefix));
}

/**
 * Check if a sessionKey is incognito (from SDK routing).
 * Inlined because isIncognitoSessionKey may not be available.
 */
function isIncognitoSessionKey(sessionKey) {
  if (!sessionKey) return false;
  return sessionKey.includes(':incognito') || sessionKey.startsWith('incognito:');
}

/**
 * Normalize agent ID (strip non-alphanumeric prefix).
 */
function normalizeAgentId(agentId) {
  if (!agentId) return undefined;
  return agentId.replace(/^[^a-zA-Z0-9]+/, '');
}

/**
 * Simple timeout wrapper for async operations.
 */
function runWithTimeout({ timeoutMs, task }) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([task(), timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Resolve hook config from plugin config with defaults.
 */
function resolveHookConfig(pluginConfig) {
  return {
    autoCapture: pluginConfig.autoCapture ?? false,
    autoRecall: pluginConfig.autoRecall ?? false,
    captureMaxChars: pluginConfig.captureMaxChars ?? DEFAULT_CAPTURE_MAX_CHARS,
    recallMaxChars: pluginConfig.recallMaxChars ?? DEFAULT_RECALL_MAX_CHARS,
    customTriggers: pluginConfig.customTriggers ?? [],
  };
}

// ── Hook Registration ──────────────────────────────────────────────────

/**
 * Register auto-memory hooks with the plugin API.
 *
 * @param {Object} api - OpenClaw plugin API (api.on, api.logger, etc.)
 * @param {Object} deps - Dependencies: { getStore, getEmbedder, pluginConfig }
 *   - getStore(): returns the LanceDB store instance (lazy, may not be ready)
 *   - getEmbedder(): returns the embedder instance (lazy)
 *   - pluginConfig: raw plugin config for hook settings
 */
export function registerAutoMemoryHooks(api, deps) {
  const { getStore, getEmbedder, pluginConfig } = deps;

  // Cursor map: key = `${agentId}:${sessionKey}`, value = AutoCaptureCursor
  const autoCaptureCursors = new Map();

  // ── before_prompt_build: auto-recall ────────────────────────────────
  api.on('before_prompt_build', async (event, ctx) => {
    const cfg = resolveHookConfig(pluginConfig);
    if (!cfg.autoRecall) return undefined;

    const agentId = normalizeAgentId(ctx.agentId);
    if (!agentId) return undefined;

    // Anti-recursion: skip memory sub-sessions
    if (isMemorySubSession(ctx.sessionKey)) return undefined;

    // Short message gate
    if (!event.prompt || event.prompt.length < 5) return undefined;

    try {
      const db = getStore();
      const embedder = getEmbedder();
      if (!db || !embedder) return undefined;

      const recallQuery = normalizeRecallQuery(
        dropMediaNoteLines(
          extractLatestUserText(Array.isArray(event.messages) ? event.messages : []) ??
            event.prompt,
        ),
        cfg.recallMaxChars,
      );
      if (!recallQuery) return undefined;

      const recall = await runWithTimeout({
        timeoutMs: DEFAULT_AUTO_RECALL_TIMEOUT_MS,
        task: async () => {
          const vector = await embedder.embed(recallQuery);
          // Overfetch to compensate for sludge filtering
          return await db.search(agentId, vector, DEFAULT_AUTO_RECALL_OVERFETCH_LIMIT, 0.3);
        },
      });

      // Filter contaminated memories, then cap
      const cleanResults = cleanMemorySearchResults(recall)
        .map(({ result, text }) => ({ category: (result.entry ?? result).category ?? 'other', text }))
        .slice(0, DEFAULT_AUTO_RECALL_RESULT_CAP);

      if (cleanResults.length === 0) return undefined;

      api.logger.info?.(`[memory-lancedb-pro] auto-recall: injecting ${cleanResults.length} memories into context`);

      const context = formatRelevantMemoriesContext(cleanResults);
      if (!context) return undefined;

      return { prependContext: context };
    } catch (err) {
      // Fail-safe: don't block agent startup on recall failure
      api.logger.warn?.(`[memory-lancedb-pro] auto-recall failed: ${String(err)}`);
      return undefined;
    }
  });

  // ── agent_end: auto-capture ─────────────────────────────────────────
  api.on('agent_end', async (event, ctx) => {
    const cfg = resolveHookConfig(pluginConfig);
    if (!cfg.autoCapture) return;
    if (isIncognitoSessionKey(ctx.sessionKey)) return;

    const agentId = normalizeAgentId(ctx.agentId);
    if (!agentId) return;

    // Anti-recursion: skip memory sub-sessions
    if (isMemorySubSession(ctx.sessionKey)) return;

    if (!event.success || !event.messages || event.messages.length === 0) return;

    try {
      const db = getStore();
      const embedder = getEmbedder();
      if (!db || !embedder) return;

      const rawCursorKey = ctx.sessionKey ?? ctx.sessionId;
      const cursorKey = rawCursorKey ? `${agentId}:${rawCursorKey}` : undefined;
      const startIndex = resolveAutoCaptureStartIndex(
        event.messages,
        cursorKey ? autoCaptureCursors.get(cursorKey) : undefined,
      );

      let stored = 0;
      let capturableSeen = 0;

      for (let index = startIndex; index < event.messages.length; index++) {
        const message = event.messages[index];
        let messageProcessed = false;

        try {
          // Extract user text content from message
          const msgObj = message?.role === 'user' ? message : null;
          if (!msgObj) {
            messageProcessed = true;
            continue;
          }

          const contentTexts = typeof msgObj.content === 'string'
            ? [msgObj.content]
            : Array.isArray(msgObj.content)
              ? msgObj.content
                  .filter(b => b?.type === 'text' && typeof b.text === 'string')
                  .map(b => b.text)
              : [];

          for (const text of contentTexts) {
            const sanitized = sanitizeForMemoryCapture(text);
            if (
              !sanitized ||
              !shouldCapture(sanitized, {
                customTriggers: cfg.customTriggers,
                maxChars: cfg.captureMaxChars,
              })
            ) {
              continue;
            }
            capturableSeen++;
            if (capturableSeen > MAX_CAPTURE_PER_TURN) continue;

            const category = detectCategory(sanitized);
            const vector = await embedder.embed(sanitized);

            const existing = await findCleanDuplicateMemory(db, agentId, vector);
            if (existing) continue;

            await db.store(agentId, {
              text: sanitized,
              vector,
              importance: 0.7,
              category,
            });
            stored++;
          }
          messageProcessed = true;
        } finally {
          if (messageProcessed && cursorKey) {
            autoCaptureCursors.set(cursorKey, {
              nextIndex: index + 1,
              lastMessageFingerprint: messageFingerprint(message),
            });
          }
        }
      }

      if (stored > 0) {
        api.logger.info?.(`[memory-lancedb-pro] auto-captured ${stored} memories`);
      }
    } catch (err) {
      api.logger.warn?.(`[memory-lancedb-pro] auto-capture failed: ${String(err)}`);
    }
  });

  // ── session_end: cursor cleanup ─────────────────────────────────────
  api.on('session_end', (event, ctx) => {
    const agentId = ctx.agentId ? normalizeAgentId(ctx.agentId) : undefined;
    const rawCursorKey = ctx.sessionKey ?? event.sessionKey ?? ctx.sessionId ?? event.sessionId;
    if (agentId && rawCursorKey) {
      autoCaptureCursors.delete(`${agentId}:${rawCursorKey}`);
    }
    const nextCursorKey = event.nextSessionKey ?? event.nextSessionId;
    if (agentId && nextCursorKey) {
      autoCaptureCursors.delete(`${agentId}:${nextCursorKey}`);
    }
  });

  api.logger.info?.('[memory-lancedb-pro] auto-memory hooks registered (autoCapture=false, autoRecall=false by default)');
}

// Export helpers for testing
export { resolveHookConfig, isMemorySubSession, isIncognitoSessionKey, normalizeAgentId };
