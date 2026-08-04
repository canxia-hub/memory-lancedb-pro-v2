/**
 * Memory Capture Policy
 *
 * Ported from openclaw/openclaw extensions/memory-lancedb/memory-policy.ts
 * Capture decision, category detection, cursor management, and recall normalization.
 *
 * SDK dependencies inlined:
 * - asOptionalRecord → inlined as asRecord
 * - normalizeLowercaseStringOrEmpty → inlined
 * - truncateUtf16Safe → inlined (shared with sanitization.js)
 * - DEFAULT_CAPTURE_MAX_CHARS / DEFAULT_RECALL_MAX_CHARS → inlined
 * - MemoryCategory type → inlined as string union
 */

import { looksLikeEnvelopeSludge } from './sanitization.js';
import { looksLikePromptInjection } from './prompt-defense.js';

// ── Inlined SDK constants ──────────────────────────────────────────────

const DEFAULT_CAPTURE_MAX_CHARS = 500;
const DEFAULT_RECALL_MAX_CHARS = 1000;

// ── Inlined utility functions ──────────────────────────────────────────

function asRecord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  return null;
}

function normalizeLowercaseStringOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
}

function truncateUtf16Safe(text, maxChars) {
  if (text.length <= maxChars) return text;
  let end = maxChars;
  if (end > 0 && text.charCodeAt(end - 1) >= 0xD800 && text.charCodeAt(end - 1) <= 0xDBFF) {
    end -= 1;
  }
  return text.slice(0, end);
}

function normalizeMaxChars(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

// ── Trigger patterns ───────────────────────────────────────────────────

const MEMORY_TRIGGERS = [
  /zapamatuj si|pamatuj|remember/i,
  /preferuji|radši|nechci|prefer/i,
  /rozhodli jsme|budeme používat/i,
  /\+\d{10,}/,
  /[\w.-]+@[\w.-]+\.\w+/,
  /můj\s+\w+\s+je|je\s+můj/i,
  /my\s+\w+\s+is|is\s+my/i,
  /i (like|prefer|hate|love|want|need)/i,
  /always|never|important/i,
  /记住|記住|记下|記下|记录|記錄|保存|存储|存儲|别忘了|別忘了|牢记|牢記|备忘|備忘|我(喜欢|喜歡|偏好|讨厌|討厭|爱|愛|想要|需要)|我的.*是|以后都用这个|以後都用這個|决定|決定|总是|總是|从不|永远|永遠|重要/i,
  /覚えて|記憶して|忘れないで|私は.*(好き|嫌い|必要|欲しい)|好み|いつも|絶対|重要/i,
  /기억해|기억해줘|잊지 마|나는.*(좋아|싫어|원해|필요)|내.*(이야|입니다)|항상|절대|중요/i,
];

const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Extract text content from a message object.
 * Handles both string content and array-of-blocks content.
 */
export function extractUserTextContent(message) {
  const msgObj = asRecord(message);
  if (!msgObj || msgObj.role !== 'user') return [];

  const content = msgObj.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];

  const texts = [];
  for (const block of content) {
    const blockObj = asRecord(block);
    if (blockObj?.type === 'text' && typeof blockObj.text === 'string') {
      texts.push(blockObj.text);
    }
  }
  return texts;
}

/**
 * Extract the latest user text from a messages array.
 * Searches from the end for the last user message with text content.
 */
export function extractLatestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const text = extractUserTextContent(messages[index]).join('\n').trim();
    if (text) return text;
  }
  return undefined;
}

/**
 * Normalize a recall query: collapse whitespace + UTF-16 safe truncation.
 */
export function normalizeRecallQuery(text, maxChars = DEFAULT_RECALL_MAX_CHARS) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const limit = normalizeMaxChars(maxChars, DEFAULT_RECALL_MAX_CHARS);
  return normalized.length > limit ? truncateUtf16Safe(normalized, limit).trimEnd() : normalized;
}

/**
 * Generate a fingerprint for a message (for cursor-based dedup).
 */
export function messageFingerprint(message) {
  const msgObj = asRecord(message);
  if (!msgObj) return `${typeof message}:${String(message)}`;
  try {
    return JSON.stringify({ role: msgObj.role, content: msgObj.content });
  } catch {
    return `${String(msgObj.role)}:${String(msgObj.content)}`;
  }
}

/**
 * Resolve the start index for incremental capture using cursor.
 * Fingerprint match → nextIndex fallback → 0.
 */
export function resolveAutoCaptureStartIndex(messages, cursor) {
  if (!cursor) return 0;
  if (cursor.lastMessageFingerprint && cursor.nextIndex > 0) {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messageFingerprint(messages[index]) === cursor.lastMessageFingerprint) {
        return index + 1;
      }
    }
    return 0;
  }
  if (cursor.nextIndex <= messages.length) return cursor.nextIndex;
  return 0;
}

/**
 * Determine if a sanitized text should be captured as a memory.
 *
 * Rejection chain: envelopeSludge → maxChars → <relevant-memories> → XML → markdown list → emoji>3 → prompt injection
 * Trigger chain: MEMORY_TRIGGERS ∪ customTriggers
 * Length gate: ≥10 chars or contains CJK
 */
export function shouldCapture(text, options) {
  if (looksLikeEnvelopeSludge(text)) return false;

  const maxChars = normalizeMaxChars(options?.maxChars, DEFAULT_CAPTURE_MAX_CHARS);
  if (text.length > maxChars) return false;
  if (text.includes('<relevant-memories>')) return false;
  if (text.startsWith('<') && text.includes('</')) return false;
  if (text.includes('**') && text.includes('\n-')) return false;

  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 3) return false;

  if (looksLikePromptInjection(text)) return false;

  const hasTrigger =
    MEMORY_TRIGGERS.some(r => r.test(text)) ||
    matchesCustomTrigger(text, options?.customTriggers);
  return hasTrigger && (text.length >= 10 || CJK_TEXT.test(text));
}

function matchesCustomTrigger(text, customTriggers) {
  if (!customTriggers || customTriggers.length === 0) return false;
  const lower = text.toLocaleLowerCase();
  return customTriggers.some(trigger => lower.includes(trigger.toLocaleLowerCase()));
}

/**
 * Detect the memory category for a given text.
 * Returns: 'preference' | 'decision' | 'entity' | 'fact' | 'other'
 */
export function detectCategory(text) {
  const lower = normalizeLowercaseStringOrEmpty(text);
  if (
    /prefer|radši|like|love|hate|want|喜欢|喜歡|偏好|讨厌|討厭|愛|好き|嫌い|좋아|싫어/i.test(lower)
  ) {
    return 'preference';
  }
  if (/rozhodli|decided|will use|budeme|决定|決定|以后都用|以後都用|これから|앞으로/i.test(lower)) {
    return 'decision';
  }
  if (/\+\d{10,}|@[\w.-]+\.\w+|is called|jmenuje se/i.test(lower)) {
    return 'entity';
  }
  if (/is|are|has|have|je|má|jsou/i.test(lower)) {
    return 'fact';
  }
  return 'other';
}

// Export constants for use by hooks and tests
export { DEFAULT_CAPTURE_MAX_CHARS, DEFAULT_RECALL_MAX_CHARS };
