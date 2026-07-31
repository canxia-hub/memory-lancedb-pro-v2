/**
 * Decay Engine — Logistic decay for reflection item scoring.
 *
 * Simplified from upstream decay-engine.ts (Weibull model).
 * For reflection items, we use the logistic model exclusively:
 *   score = 1 / (1 + exp(k * (ageDays - midpointDays)))
 *   weighted = score * baseWeight * quality * fallbackFactor
 *
 * The full Weibull decay engine is reserved for M4 (dreaming).
 */

// ── Constants ──────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ── Logistic Decay ─────────────────────────────────────────────────────

/**
 * Compute logistic decay value.
 * @param {number} ageDays
 * @param {number} midpointDays
 * @param {number} k
 * @returns {number}
 */
export function computeReflectionLogistic(ageDays, midpointDays, k) {
  const safeAgeDays = Number.isFinite(ageDays) ? Math.max(0, ageDays) : 0;
  const safeMidpointDays = Number.isFinite(midpointDays) && midpointDays > 0 ? midpointDays : 1;
  const safeK = Number.isFinite(k) && k > 0 ? k : 0.1;
  return 1 / (1 + Math.exp(safeK * (safeAgeDays - safeMidpointDays)));
}

/**
 * Reflection fallback score factor for items produced by fallback distiller.
 */
export const REFLECTION_FALLBACK_SCORE_FACTOR = 0.75;

/**
 * Compute weighted reflection score for an item.
 *
 * @param {Object} input
 * @param {number} input.ageDays
 * @param {number} input.midpointDays
 * @param {number} input.k
 * @param {number} input.baseWeight
 * @param {number} input.quality
 * @param {boolean} input.usedFallback
 * @returns {number}
 */
export function computeReflectionScore(input) {
  const logistic = computeReflectionLogistic(input.ageDays, input.midpointDays, input.k);
  const baseWeight = Number.isFinite(input.baseWeight) && input.baseWeight > 0 ? input.baseWeight : 1;
  const quality = Number.isFinite(input.quality) ? Math.max(0, Math.min(1, input.quality)) : 1;
  const fallbackFactor = input.usedFallback ? REFLECTION_FALLBACK_SCORE_FACTOR : 1;
  return logistic * baseWeight * quality * fallbackFactor;
}

/**
 * Normalize a reflection line for aggregation (dedup during ranking).
 * @param {string} line
 * @returns {string}
 */
export function normalizeReflectionLineForAggregation(line) {
  return String(line)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// ── Reflection Store Constants ─────────────────────────────────────────

export const REFLECTION_DERIVE_LOGISTIC_MIDPOINT_DAYS = 3;
export const REFLECTION_DERIVE_LOGISTIC_K = 1.2;
export const REFLECTION_DERIVE_FALLBACK_BASE_WEIGHT = 0.35;

export const DEFAULT_REFLECTION_DERIVED_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_REFLECTION_MAPPED_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

// ── Mapped Decay Defaults ──────────────────────────────────────────────

const REFLECTION_MAPPED_DECAY_DEFAULTS = {
  decision: { midpointDays: 45, k: 0.25, baseWeight: 1.1, quality: 1 },
  'user-model': { midpointDays: 21, k: 0.3, baseWeight: 1, quality: 0.95 },
  'agent-model': { midpointDays: 10, k: 0.35, baseWeight: 0.95, quality: 0.93 },
  lesson: { midpointDays: 7, k: 0.45, baseWeight: 0.9, quality: 0.9 },
};

/**
 * Get decay defaults for a mapped reflection kind.
 * @param {"user-model"|"agent-model"|"lesson"|"decision"} kind
 * @returns {{midpointDays: number, k: number, baseWeight: number, quality: number}}
 */
export function getReflectionMappedDecayDefaults(kind) {
  return REFLECTION_MAPPED_DECAY_DEFAULTS[kind] || REFLECTION_MAPPED_DECAY_DEFAULTS.lesson;
}

/**
 * Compute derived line quality based on non-placeholder line count.
 * @param {number} nonPlaceholderLineCount
 * @returns {number}
 */
export function computeDerivedLineQuality(nonPlaceholderLineCount) {
  const n = Number.isFinite(nonPlaceholderLineCount) ? Math.max(0, Math.floor(nonPlaceholderLineCount)) : 0;
  if (n <= 0) return 0.2;
  return Math.min(1, 0.55 + Math.min(6, n) * 0.075);
}
