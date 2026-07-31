/**
 * Reflection Distiller — Sub-session orchestration for LLM-based reflection.
 *
 * Uses api.runtime.agent.runEmbeddedPiAgent (host 2026.7.1-2 confirmed available)
 * to run a lightweight embedded sub-session that distills reflection insights.
 *
 * Design:
 * - sessionKey: temp:memory-reflection:<agentId> (anti-recursion guard prefix)
 * - modelRun: true (host skips before_prompt_build for ALL plugins)
 * - disableTools: true, disableMessageTool: true
 * - bootstrapContextMode: "lightweight"
 * - Output text → slices.parse → item-store/admission → persist (source=reflection)
 * - Supports mock runner injection for testing
 * - Model selection: config.reflection.distillerModel (null=follow agent default)
 */

import {
  extractReflectionSlices,
  extractReflectionSliceItems,
  extractReflectionMappedMemoryItems,
  extractReflectionLearningGovernanceCandidates,
} from './slices.js';
import { buildReflectionItemPayloads } from './item-store.js';
import { buildReflectionEventPayload, createReflectionEventId } from './event-store.js';
import { gateMappedReflectionEntries, normalizeAdmissionControlConfig } from './admission.js';
import { runWithReflectionTransientRetryOnce } from './retry.js';
import {
  computeReflectionScore,
  getReflectionMappedDecayDefaults,
  DEFAULT_REFLECTION_DERIVED_MAX_AGE_MS,
  DEFAULT_REFLECTION_MAPPED_MAX_AGE_MS,
} from './decay.js';

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_DISTILLER_TIMEOUT_MS = 30_000;
const REFLECTION_SESSION_KEY_PREFIX = 'temp:memory-reflection:';

/**
 * Reflection prompt template for the distiller sub-session.
 * Instructs the LLM to produce structured markdown with specific sections.
 */
const REFLECTION_DISTILLER_PROMPT = `You are a reflection distiller. Analyze the conversation below and produce a structured reflection.

## Output Format (strict markdown)

### Invariants
- (stable rules, policies, or persistent facts discovered or reinforced this session)

### Derived
- (session-specific deltas, follow-ups, adjustments, or next-run actions)

### User model deltas (about the human)
- (updates to what you know about the user's preferences, style, or context)

### Agent model deltas (about the assistant/system)
- (updates to what you know about your own behavior, strengths, or areas to improve)

### Lessons & pitfalls (symptom / cause / fix / prevention)
- (actionable lessons from errors, near-misses, or successful patterns this session)

### Decisions (durable)
- (decisions made this session that should persist as rules or policies)

### Open loops / next actions
- (unresolved items that need follow-up in the next session)

### Learning governance candidates (.learnings / promotion / skill extraction)
- (patterns that might warrant promotion to durable rules, skills, or config changes)

---

## Conversation to reflect on:

`;

// ── Lane Management ────────────────────────────────────────────────────

/**
 * Per-agent lane queue for bounded concurrency.
 * Each agent gets its own lane; maxConcurrency controls parallel distillers per lane.
 */
export class ReflectionLaneManager {
  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
    /** @type {Map<string, {active: number, queue: Array<() => void>}>} */
    this.lanes = new Map();
  }

  /**
   * Acquire a slot in the agent's lane. Returns a release function.
   * @param {string} agentId
   * @returns {Promise<() => void>}
   */
  async acquire(agentId) {
    let lane = this.lanes.get(agentId);
    if (!lane) {
      lane = { active: 0, queue: [] };
      this.lanes.set(agentId, lane);
    }

    if (lane.active < this.maxConcurrency) {
      lane.active++;
      return () => this._release(agentId);
    }

    // Wait in queue
    return new Promise((resolve) => {
      lane.queue.push(() => {
        lane.active++;
        resolve(() => this._release(agentId));
      });
    });
  }

  _release(agentId) {
    const lane = this.lanes.get(agentId);
    if (!lane) return;
    lane.active = Math.max(0, lane.active - 1);
    if (lane.queue.length > 0) {
      const next = lane.queue.shift();
      next();
    }
    if (lane.active === 0 && lane.queue.length === 0) {
      this.lanes.delete(agentId);
    }
  }
}

// ── Ownership Check ────────────────────────────────────────────────────

/**
 * Check if a memory entry is owned by a specific agent (scope leak hardening, #923).
 * @param {object} metadata
 * @param {string} agentId
 * @returns {boolean}
 */
export function isOwnedByAgent(metadata, agentId) {
  if (!metadata || !agentId) return false;
  // Check agentId field in metadata
  if (metadata.agentId === agentId) return true;
  // Check scope field (agent-scoped memories)
  if (typeof metadata.scope === 'string' && metadata.scope === `agent:${agentId}`) return true;
  return false;
}

// ── Distiller Config ───────────────────────────────────────────────────

/**
 * Normalize reflection config from raw plugin config.
 * @param {object} rawConfig
 * @returns {object}
 */
export function normalizeReflectionConfig(rawConfig) {
  const reflection = rawConfig?.reflection;
  if (!reflection || typeof reflection !== 'object') {
    return {
      enabled: false,
      distillerModel: null,
      maxConcurrency: 2,
      derivedMaxAgeDays: 14,
      mappedMaxAgeDays: 60,
      admissionPreset: 'balanced',
    };
  }
  return {
    enabled: reflection.enabled === true,
    distillerModel: typeof reflection.distillerModel === 'string' ? reflection.distillerModel : null,
    maxConcurrency: typeof reflection.maxConcurrency === 'number' && reflection.maxConcurrency >= 1
      ? Math.floor(reflection.maxConcurrency) : 2,
    derivedMaxAgeDays: typeof reflection.derivedMaxAgeDays === 'number' && reflection.derivedMaxAgeDays > 0
      ? reflection.derivedMaxAgeDays : 14,
    mappedMaxAgeDays: typeof reflection.mappedMaxAgeDays === 'number' && reflection.mappedMaxAgeDays > 0
      ? reflection.mappedMaxAgeDays : 60,
    admissionPreset: typeof reflection.admissionPreset === 'string'
      ? reflection.admissionPreset : 'balanced',
  };
}

// ── Embedded Runner Loader ─────────────────────────────────────────────

/**
 * Load the embedded PiAgent runner from the plugin API.
 * Tries api.runtime.agent.runEmbeddedPiAgent first (SDK 4.22+).
 *
 * @param {object} api - OpenClaw plugin API
 * @returns {Promise<Function|null>}
 */
export async function loadEmbeddedRunner(api) {
  // Layer 1: New SDK API
  try {
    const runtimeAgent = api?.runtime?.agent;
    if (runtimeAgent && typeof runtimeAgent.runEmbeddedPiAgent === 'function') {
      return runtimeAgent.runEmbeddedPiAgent.bind(runtimeAgent);
    }
  } catch { /* fall through */ }

  // Layer 2: Direct import from extensionAPI.js (runtime only, not in test env)
  try {
    // Use a variable to avoid vite static analysis
    const specifier = 'openclaw/dist/extensionAPI.js';
    const mod = await import(/* @vite-ignore */ specifier);
    if (mod && typeof mod.runEmbeddedPiAgent === 'function') {
      return mod.runEmbeddedPiAgent;
    }
  } catch { /* not available in test env */ }

  return null;
}

// ── Distiller Core ─────────────────────────────────────────────────────

/**
 * Build the reflection prompt from conversation messages.
 * @param {Array<{role: string, content: string|Array}>} messages
 * @returns {string}
 */
export function buildReflectionPrompt(messages) {
  const conversationLines = [];
  for (const msg of messages || []) {
    const role = msg.role || 'unknown';
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter(b => b?.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('\n');
    }
    if (text) {
      conversationLines.push(`[${role}]: ${text}`);
    }
  }
  return REFLECTION_DISTILLER_PROMPT + conversationLines.join('\n\n');
}

/**
 * Run the distiller sub-session and return the reflection text.
 *
 * @param {Object} params
 * @param {object} params.api - OpenClaw plugin API
 * @param {string} params.agentId
 * @param {string} params.sessionKey
 * @param {string} params.sessionId
 * @param {Array} params.messages - Conversation messages to reflect on
 * @param {object} params.reflectionConfig - Normalized reflection config
 * @param {Function} [params.mockRunner] - Optional mock runner for testing
 * @param {(level: string, msg: string) => void} [params.onLog]
 * @param {number} [params.timeoutMs]
 * @returns {Promise<{text: string|null, usedFallback: boolean, runner: string, error?: string}>}
 */
export async function runDistiller(params) {
  const {
    api,
    agentId,
    sessionKey,
    sessionId,
    messages,
    reflectionConfig,
    mockRunner,
    onLog,
    timeoutMs = DEFAULT_DISTILLER_TIMEOUT_MS,
  } = params;

  const prompt = buildReflectionPrompt(messages);
  const embeddedTimeoutMs = Math.max(timeoutMs + 5000, 15000);
  const retryState = { count: 0 };

  const onRetryLog = (level, message) => {
    if (onLog) onLog(level, message);
  };

  // Use mock runner if provided (testing)
  const runner = mockRunner || (await loadEmbeddedRunner(api));

  if (!runner) {
    onLog?.('warn', 'memory-reflection: no embedded runner available, skipping distiller');
    return { text: null, usedFallback: false, runner: 'none', error: 'no_runner_available' };
  }

  try {
    const result = await runWithReflectionTransientRetryOnce({
      scope: 'distiller',
      runner: 'embedded',
      retryState,
      onLog: onRetryLog,
      execute: async () => {
        const runParams = {
          sessionId: `reflection-${Date.now()}`,
          sessionKey: `${REFLECTION_SESSION_KEY_PREFIX}${agentId}`,
          agentId,
          prompt,
          promptMode: 'minimal',
          disableTools: true,
          disableMessageTool: true,
          modelRun: true,
          timeoutMs,
          runId: `memory-reflection-${Date.now()}`,
          bootstrapContextMode: 'lightweight',
        };

        // Model selection: config override or follow default
        if (reflectionConfig.distillerModel) {
          const modelRef = reflectionConfig.distillerModel;
          const slashIdx = modelRef.indexOf('/');
          if (slashIdx > 0) {
            runParams.provider = modelRef.slice(0, slashIdx);
            runParams.model = modelRef.slice(slashIdx + 1);
          } else {
            runParams.model = modelRef;
          }
        }

        // Wrap with timeout
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`embedded reflection run timed out after ${embeddedTimeoutMs}ms`));
          }, embeddedTimeoutMs);

          Promise.resolve(runner(runParams)).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); },
          );
        });
      },
    });

    // Extract text from result
    let reflectionText = null;
    if (result && typeof result === 'object') {
      // Check payloads array first (standard embedded run output)
      const payloads = Array.isArray(result.payloads) ? result.payloads : [];
      const firstWithText = payloads.find(p =>
        p && typeof p === 'object' && typeof p.text === 'string' && p.text.trim().length > 0
      );
      if (firstWithText) {
        reflectionText = firstWithText.text.trim();
      }
      // Fallback: direct text property
      else if (typeof result.text === 'string' && result.text.trim().length > 0) {
        reflectionText = result.text.trim();
      }
      // Fallback: content property
      else if (typeof result.content === 'string' && result.content.trim().length > 0) {
        reflectionText = result.content.trim();
      }
    }
    // String result
    else if (typeof result === 'string' && result.trim().length > 0) {
      reflectionText = result.trim();
    }

    return { text: reflectionText, usedFallback: false, runner: 'embedded' };
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    onLog?.('warn', `memory-reflection: distiller failed: ${errMsg}`);
    return { text: null, usedFallback: false, runner: 'embedded', error: errMsg };
  }
}

// ── Reflection Pipeline ────────────────────────────────────────────────

/**
 * Process reflection text into store payloads.
 *
 * @param {Object} params
 * @param {string} params.reflectionText
 * @param {string} params.agentId
 * @param {string} params.sessionKey
 * @param {string} params.sessionId
 * @param {string} params.scope
 * @param {string} params.command
 * @param {Array<{signatureHash: string}>} params.toolErrorSignals
 * @param {number} params.runAt
 * @param {boolean} params.usedFallback
 * @param {string} [params.sourceReflectionPath]
 * @returns {{eventId: string, slices: object, payloads: Array, governanceCandidates: Array}}
 */
export function processReflectionText(params) {
  const { reflectionText } = params;
  if (!reflectionText || typeof reflectionText !== 'string') {
    return { eventId: '', slices: { invariants: [], derived: [] }, payloads: [], governanceCandidates: [] };
  }

  const slices = extractReflectionSlices(reflectionText);
  const eventId = createReflectionEventId({
    runAt: params.runAt,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
    command: params.command,
  });

  const payloads = [];

  // Event payload
  payloads.push(buildReflectionEventPayload({
    eventId,
    scope: params.scope,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
    command: params.command,
    toolErrorSignals: params.toolErrorSignals,
    runAt: params.runAt,
    usedFallback: params.usedFallback,
    sourceReflectionPath: params.sourceReflectionPath,
  }));

  // Item payloads (invariant + derived)
  const sliceItems = extractReflectionSliceItems(reflectionText);
  const itemPayloads = buildReflectionItemPayloads({
    items: sliceItems,
    eventId,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    runAt: params.runAt,
    usedFallback: params.usedFallback,
    toolErrorSignals: params.toolErrorSignals,
    sourceReflectionPath: params.sourceReflectionPath,
  });
  payloads.push(...itemPayloads);

  // Governance candidates (not stored, returned for audit)
  const governanceCandidates = extractReflectionLearningGovernanceCandidates(reflectionText);

  return { eventId, slices, payloads, governanceCandidates };
}

/**
 * Full reflection pipeline: distill → parse → persist.
 *
 * @param {Object} params
 * @param {object} params.api - OpenClaw plugin API
 * @param {string} params.agentId
 * @param {string} params.sessionKey
 * @param {string} params.sessionId
 * @param {Array} params.messages
 * @param {object} params.reflectionConfig
 * @param {object} params.admissionConfig
 * @param {Function} params.getStore - () => LanceDB store
 * @param {Function} params.getEmbedder - () => embedder
 * @param {Function} [params.mockRunner]
 * @param {(level: string, msg: string) => void} [params.onLog]
 * @param {number} [params.timeoutMs]
 * @returns {Promise<{stored: number, eventId: string, slices: object, error?: string}>}
 */
export async function runReflectionPipeline(params) {
  const {
    api,
    agentId,
    sessionKey,
    sessionId,
    messages,
    reflectionConfig,
    admissionConfig,
    getStore,
    getEmbedder,
    mockRunner,
    onLog,
    timeoutMs,
  } = params;

  // Step 1: Run distiller
  const distillResult = await runDistiller({
    api,
    agentId,
    sessionKey,
    sessionId,
    messages,
    reflectionConfig,
    mockRunner,
    onLog,
    timeoutMs,
  });

  if (!distillResult.text) {
    onLog?.('info', 'memory-reflection: distiller produced no output, skipping store');
    return { stored: 0, eventId: '', slices: { invariants: [], derived: [] }, error: distillResult.error };
  }

  // Step 2: Process reflection text into payloads
  const runAt = Date.now();
  const { eventId, slices, payloads, governanceCandidates } = processReflectionText({
    reflectionText: distillResult.text,
    agentId,
    sessionKey,
    sessionId,
    scope: 'session-end',
    command: 'reflect',
    toolErrorSignals: [],
    runAt,
    usedFallback: distillResult.usedFallback,
  });

  if (payloads.length === 0) {
    return { stored: 0, eventId, slices, error: 'no_payloads' };
  }

  // Step 3: Persist payloads to LanceDB
  const db = getStore();
  const embedder = getEmbedder();
  if (!db || !embedder) {
    onLog?.('warn', 'memory-reflection: store or embedder not available, skipping persist');
    return { stored: 0, eventId, slices, error: 'store_unavailable' };
  }

  let stored = 0;
  for (const payload of payloads) {
    try {
      // Skip event payloads from embedding (they're metadata-only)
      if (payload.kind === 'event') {
        // Store event with zero vector (metadata record)
        const zeroVector = new Array(embedder.dimension || 2560).fill(0);
        await db.store(agentId, {
          text: payload.text,
          vector: zeroVector,
          importance: 0.3,
          category: 'other',
          source: 'reflection',
          metadata: payload.metadata,
        });
        stored++;
        continue;
      }

      // Embed and store item payloads
      const vector = await embedder.embed(payload.text);
      const itemKind = payload.kind; // 'item-invariant' or 'item-derived'
      const importance = itemKind === 'item-invariant' ? 0.9 : 0.7;

      await db.store(agentId, {
        text: payload.text,
        vector,
        importance,
        category: itemKind === 'item-invariant' ? 'fact' : 'other',
        source: 'reflection',
        metadata: {
          ...payload.metadata,
          source: 'reflection',
        },
      });
      stored++;
    } catch (err) {
      onLog?.('warn', `memory-reflection: failed to store payload (${payload.kind}): ${String(err)}`);
    }
  }

  // Step 4: Process mapped memories through admission control
  const mappedItems = extractReflectionMappedMemoryItems(distillResult.text);
  if (mappedItems.length > 0) {
    const normalizedAdmission = normalizeAdmissionControlConfig(admissionConfig);
    const mappedRows = [];
    for (const item of mappedItems) {
      try {
        const vector = await embedder.embed(item.text);
        mappedRows.push({ ...item, vector });
      } catch (err) {
        onLog?.('warn', `memory-reflection: failed to embed mapped item: ${String(err)}`);
      }
    }

    if (mappedRows.length > 0) {
      const admissionResults = await gateMappedReflectionEntries({
        admissionController: normalizedAdmission.enabled ? normalizedAdmission : null,
        attachAudit: normalizedAdmission.auditMetadata,
        rows: mappedRows,
        conversationText: distillResult.text,
        scopeFilter: [agentId],
        warnLog: (msg) => onLog?.('warn', msg),
      });

      for (let i = 0; i < mappedRows.length; i++) {
        const row = mappedRows[i];
        const admission = admissionResults[i];
        if (!admission?.admit) continue;

        try {
          const mappedDecay = getReflectionMappedDecayDefaults(row.mappedKind);

          await db.store(agentId, {
            text: row.text,
            vector: row.vector,
            importance: 0.8,
            category: row.category,
            source: 'reflection',
            metadata: {
              type: 'memory-reflection-mapped',
              reflectionVersion: 4,
              mappedKind: row.mappedKind,
              heading: row.heading,
              ordinal: row.ordinal,
              groupSize: row.groupSize,
              agentId,
              sessionKey,
              sessionId,
              storedAt: runAt,
              source: 'reflection',
              decayModel: 'logistic',
              decayMidpointDays: mappedDecay.midpointDays,
              decayK: mappedDecay.k,
              baseWeight: mappedDecay.baseWeight,
              quality: mappedDecay.quality,
              ...(admission.auditJson ? { admissionAudit: admission.auditJson } : {}),
            },
          });
          stored++;
        } catch (err) {
          onLog?.('warn', `memory-reflection: failed to store mapped item: ${String(err)}`);
        }
      }
    }
  }

  // Log governance candidates (not stored, for audit only)
  if (governanceCandidates.length > 0) {
    onLog?.('info', `memory-reflection: ${governanceCandidates.length} governance candidates produced (audit only)`);
  }

  onLog?.('info', `memory-reflection: stored ${stored} items from distiller run (eventId=${eventId})`);
  return { stored, eventId, slices, error: distillResult.error };
}

// ── In-process Reflection Cache ────────────────────────────────────────

/**
 * Simple in-process cache for reflection items, keyed by agentId.
 * Invalidated on memory delete/delete-bulk operations.
 */
export class ReflectionCache {
  constructor() {
    /** @type {Map<string, {items: Array, updatedAt: number}>} */
    this.cache = new Map();
    this.ttlMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cached reflection items for an agent.
   * @param {string} agentId
   * @returns {Array|null}
   */
  get(agentId) {
    const entry = this.cache.get(agentId);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > this.ttlMs) {
      this.cache.delete(agentId);
      return null;
    }
    return entry.items;
  }

  /**
   * Set cached reflection items for an agent.
   * @param {string} agentId
   * @param {Array} items
   */
  set(agentId, items) {
    this.cache.set(agentId, { items, updatedAt: Date.now() });
  }

  /**
   * Invalidate cache for an agent (or all agents if no agentId).
   * Called on memory delete/delete-bulk.
   * @param {string} [agentId]
   */
  invalidate(agentId) {
    if (agentId) {
      this.cache.delete(agentId);
    } else {
      this.cache.clear();
    }
  }
}
