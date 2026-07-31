/**
 * Memory Deduplication
 *
 * Ported from openclaw/openclaw extensions/memory-lancedb/memory-policy.ts
 * (findCleanDuplicateMemory function)
 *
 * Finds near-duplicate memories using vector similarity (0.95 threshold)
 * with envelope sludge filtering.
 */

import { looksLikeEnvelopeSludge } from './sanitization.js';

const DUPLICATE_SEARCH_LIMIT = 5;
const DUPLICATE_MIN_SCORE = 0.95;

/**
 * Sanitize recall memory text — returns null if sludge or empty.
 * (Shared logic with prompt-defense.js, duplicated here to avoid circular deps)
 */
function sanitizeRecallMemoryText(text) {
  if (!text || !text.trim()) return null;
  return looksLikeEnvelopeSludge(text) ? null : text;
}

/**
 * Find a clean duplicate memory in the database.
 *
 * Searches for similar vectors (minScore=0.95) and returns the first
 * result that passes sludge sanitization.
 *
 * @param {Object} db - Store with search(agentId, vector, limit, minScore) method
 * @param {string} agentId - Agent identifier
 * @param {number[]} vector - Embedding vector to search against
 * @returns {Promise<Object|undefined>} First clean duplicate, or undefined
 */
export async function findCleanDuplicateMemory(db, agentId, vector) {
  const existing = await db.search(agentId, vector, DUPLICATE_SEARCH_LIMIT, DUPLICATE_MIN_SCORE);
  return existing.find(result => {
    const entry = result.entry ?? result;
    const text = entry.text ?? entry.content ?? '';
    return sanitizeRecallMemoryText(text) !== null;
  });
}
