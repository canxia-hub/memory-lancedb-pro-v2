/**
 * Reflection Item Store — Build invariant/derived item payloads for persistence.
 *
 * Ported from upstream reflection-item-store.ts.
 * Schema v4 with logistic decay parameters per item kind.
 */

// ── Decay Constants (§2.2 实测值) ──────────────────────────────────────

export const REFLECTION_INVARIANT_DECAY_MIDPOINT_DAYS = 45;
export const REFLECTION_INVARIANT_DECAY_K = 0.22;
export const REFLECTION_INVARIANT_BASE_WEIGHT = 1.1;
export const REFLECTION_INVARIANT_QUALITY = 1;

export const REFLECTION_DERIVED_DECAY_MIDPOINT_DAYS = 7;
export const REFLECTION_DERIVED_DECAY_K = 0.65;
export const REFLECTION_DERIVED_BASE_WEIGHT = 1;
export const REFLECTION_DERIVED_QUALITY = 0.95;

/**
 * Get decay defaults for a reflection item kind.
 * @param {"invariant"|"derived"} itemKind
 * @returns {{ midpointDays: number, k: number, baseWeight: number, quality: number }}
 */
export function getReflectionItemDecayDefaults(itemKind) {
  if (itemKind === 'invariant') {
    return {
      midpointDays: REFLECTION_INVARIANT_DECAY_MIDPOINT_DAYS,
      k: REFLECTION_INVARIANT_DECAY_K,
      baseWeight: REFLECTION_INVARIANT_BASE_WEIGHT,
      quality: REFLECTION_INVARIANT_QUALITY,
    };
  }
  return {
    midpointDays: REFLECTION_DERIVED_DECAY_MIDPOINT_DAYS,
    k: REFLECTION_DERIVED_DECAY_K,
    baseWeight: REFLECTION_DERIVED_BASE_WEIGHT,
    quality: REFLECTION_DERIVED_QUALITY,
  };
}

/**
 * Build reflection item payloads from slice items.
 *
 * @param {Object} params
 * @param {import('./slices.js').ReflectionSliceItem[]} params.items
 * @param {string} params.eventId
 * @param {string} params.agentId
 * @param {string} params.sessionKey
 * @param {string} params.sessionId
 * @param {number} params.runAt
 * @param {boolean} params.usedFallback
 * @param {Array<{signatureHash: string}>} params.toolErrorSignals
 * @param {string} [params.sourceReflectionPath]
 * @returns {Array<{kind: "item-invariant"|"item-derived", text: string, metadata: object}>}
 */
export function buildReflectionItemPayloads(params) {
  return params.items.map((item) => {
    const defaults = getReflectionItemDecayDefaults(item.itemKind);
    const metadata = {
      type: 'memory-reflection-item',
      reflectionVersion: 4,
      stage: 'reflect-store',
      eventId: params.eventId,
      itemKind: item.itemKind,
      section: item.section,
      ordinal: item.ordinal,
      groupSize: item.groupSize,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      storedAt: params.runAt,
      usedFallback: params.usedFallback,
      errorSignals: params.toolErrorSignals.map((signal) => signal.signatureHash),
      decayModel: 'logistic',
      decayMidpointDays: defaults.midpointDays,
      decayK: defaults.k,
      baseWeight: defaults.baseWeight,
      quality: defaults.quality,
    };

    if (params.sourceReflectionPath) {
      metadata.sourceReflectionPath = params.sourceReflectionPath;
    }

    return {
      kind: item.itemKind === 'invariant' ? 'item-invariant' : 'item-derived',
      text: item.text,
      metadata,
    };
  });
}
