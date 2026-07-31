/**
 * Reflection Injector — before_prompt_build injection with priority layering.
 *
 * Injects reflection-derived context into the agent's prompt at two priority levels:
 * - invariant (priority 12): stable rules and policies (higher priority = injected first)
 * - derived (priority 15): session-specific deltas and follow-ups
 *
 * Priority ordering: auto-recall (10) < invariant (12) < derived (15)
 * Weighted by logistic decay (decay.js) for age-based relevance scoring.
 * All injected lines pass through sanitizeInjectableReflectionLines for safety.
 */

import {
  extractInjectableReflectionSlices,
  extractInjectableReflectionSliceItems,
  sanitizeInjectableReflectionLines,
} from './slices.js';
import {
  computeReflectionScore,
  computeReflectionLogistic,
  normalizeReflectionLineForAggregation,
  DEFAULT_REFLECTION_DERIVED_MAX_AGE_MS,
} from './decay.js';

// ── Priority Constants ─────────────────────────────────────────────────

/** Priority levels for before_prompt_build injection ordering. */
export const REFLECTION_INJECTION_PRIORITIES = {
  autoRecall: 10,
  invariant: 12,
  derived: 15,
};

// ── Reflection Item Retrieval ──────────────────────────────────────────

/**
 * Retrieve reflection items from the store for injection.
 * Queries memories with source=reflection, filtered by agent scope.
 *
 * @param {Object} params
 * @param {object} params.db - LanceDB store instance
 * @param {object} params.embedder - Embedder instance
 * @param {string} params.agentId
 * @param {number} params.maxItems - Maximum items to retrieve
 * @param {number} params.maxAgeMs - Maximum age in milliseconds
 * @param {string} params.itemKind - 'invariant' or 'derived'
 * @returns {Promise<Array<{text: string, metadata: object, score: number}>>}
 */
export async function retrieveReflectionItemsForInjection(params) {
  const { db, embedder, agentId, maxItems = 5, maxAgeMs, itemKind } = params;
  if (!db || !embedder) return [];

  const effectiveMaxAge = maxAgeMs ?? DEFAULT_REFLECTION_DERIVED_MAX_AGE_MS;
  const now = Date.now();
  const minStoredAt = now - effectiveMaxAge;

  try {
    // Search for reflection items using a generic query
    const queryVector = await embedder.embed(
      itemKind === 'invariant'
        ? 'stable rules policies invariants persistent facts'
        : 'session deltas follow-ups adjustments next-run actions derived changes'
    );

    const results = await db.search(agentId, queryVector, maxItems * 3, 0.2);

    // Filter to reflection-sourced items of the correct kind within age window
    const filtered = [];
    for (const result of results) {
      const entry = result.entry ?? result;
      const metadata = entry.metadata || {};
      if (metadata.source !== 'reflection') continue;
      if (metadata.itemKind !== itemKind) continue;
      if (metadata.type === 'memory-reflection-event') continue; // Skip event records

      const storedAt = metadata.storedAt || 0;
      if (storedAt < minStoredAt) continue;

      // Compute decay-weighted score
      const ageMs = now - storedAt;
      const ageDays = ageMs / 86_400_000;
      const score = computeReflectionScore({
        ageDays,
        midpointDays: metadata.decayMidpointDays || (itemKind === 'invariant' ? 45 : 7),
        k: metadata.decayK || (itemKind === 'invariant' ? 0.22 : 0.65),
        baseWeight: metadata.baseWeight || (itemKind === 'invariant' ? 1.1 : 1.0),
        quality: metadata.quality || (itemKind === 'invariant' ? 1 : 0.95),
        usedFallback: metadata.usedFallback || false,
      });

      filtered.push({
        text: entry.text,
        metadata,
        score,
        ageDays,
      });
    }

    // Sort by score descending, take top maxItems
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, maxItems);
  } catch (err) {
    // Fail-safe: don't block agent startup on injection failure
    return [];
  }
}

// ── Injection Formatting ───────────────────────────────────────────────

/**
 * Format reflection items for prompt injection.
 * Applies safety filtering and deduplication.
 *
 * @param {Object} params
 * @param {Array<{text: string, metadata: object, score: number}>} params.invariantItems
 * @param {Array<{text: string, metadata: object, score: number}>} params.derivedItems
 * @param {number} [params.maxInvariantLines=6]
 * @param {number} [params.maxDerivedLines=8]
 * @returns {{invariantContext: string, derivedContext: string, invariantLines: string[], derivedLines: string[]}}
 */
export function formatReflectionInjectionContext(params) {
  const {
    invariantItems,
    derivedItems,
    maxInvariantLines = 6,
    maxDerivedLines = 8,
  } = params;

  // Extract and sanitize invariant lines
  const rawInvariantLines = invariantItems
    .flatMap(item => item.text.split('\n'))
    .map(line => line.trim())
    .filter(Boolean);

  const invariantLines = sanitizeInjectableReflectionLines(rawInvariantLines)
    .slice(0, maxInvariantLines);

  // Extract and sanitize derived lines
  const rawDerivedLines = derivedItems
    .flatMap(item => item.text.split('\n'))
    .map(line => line.trim())
    .filter(Boolean);

  const derivedLines = sanitizeInjectableReflectionLines(rawDerivedLines)
    .slice(0, maxDerivedLines);

  // Deduplicate across both sets (normalize for comparison)
  const seenNormalized = new Set();
  const dedupedInvariant = [];
  for (const line of invariantLines) {
    const norm = normalizeReflectionLineForAggregation(line);
    if (seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    dedupedInvariant.push(line);
  }

  const dedupedDerived = [];
  for (const line of derivedLines) {
    const norm = normalizeReflectionLineForAggregation(line);
    if (seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    dedupedDerived.push(line);
  }

  // Format context strings
  const invariantContext = dedupedInvariant.length > 0
    ? [
        '## Reflection Invariants (stable rules from past sessions)',
        ...dedupedInvariant.map(l => `- ${l}`),
        '',
      ].join('\n')
    : '';

  const derivedContext = dedupedDerived.length > 0
    ? [
        '## Reflection Deltas (session-specific adjustments)',
        ...dedupedDerived.map(l => `- ${l}`),
        '',
      ].join('\n')
    : '';

  return {
    invariantContext,
    derivedContext,
    invariantLines: dedupedInvariant,
    derivedLines: dedupedDerived,
  };
}

// ── before_prompt_build Handler ────────────────────────────────────────

/**
 * Register reflection injection into before_prompt_build hook.
 *
 * @param {object} api - OpenClaw plugin API
 * @param {object} deps - Dependencies
 * @param {Function} deps.getStore - () => LanceDB store
 * @param {Function} deps.getEmbedder - () => embedder
 * @param {object} deps.pluginConfig - Raw plugin config
 * @param {import('./distiller.js').ReflectionCache} deps.reflectionCache - In-process cache
 */
export function registerReflectionInjector(api, deps) {
  const { getStore, getEmbedder, pluginConfig, reflectionCache } = deps;

  api.on('before_prompt_build', async (event, ctx) => {
    // Check if reflection is enabled
    const reflection = pluginConfig?.reflection;
    if (!reflection || reflection.enabled !== true) return undefined;

    const agentId = ctx.agentId?.replace(/^[^a-zA-Z0-9]+/, '');
    if (!agentId) return undefined;

    // Anti-recursion: skip memory sub-sessions
    const sessionKey = ctx.sessionKey || '';
    if (sessionKey.startsWith('temp:memory-reflection:') ||
        sessionKey.startsWith('reflection:') ||
        sessionKey.startsWith('distiller:') ||
        sessionKey.startsWith('dreaming:')) {
      return undefined;
    }

    // Short message gate
    if (!event.prompt || event.prompt.length < 5) return undefined;

    try {
      const db = getStore();
      const embedder = getEmbedder();
      if (!db || !embedder) return undefined;

      // Check cache first
      let cachedItems = reflectionCache?.get(agentId);

      if (!cachedItems) {
        // Retrieve invariant and derived items
        const [invariantItems, derivedItems] = await Promise.all([
          retrieveReflectionItemsForInjection({
            db, embedder, agentId,
            maxItems: 6,
            itemKind: 'invariant',
          }),
          retrieveReflectionItemsForInjection({
            db, embedder, agentId,
            maxItems: 8,
            maxAgeMs: (reflection.derivedMaxAgeDays || 14) * 86_400_000,
            itemKind: 'derived',
          }),
        ]);

        cachedItems = { invariantItems, derivedItems };
        reflectionCache?.set(agentId, cachedItems);
      }

      const { invariantContext, derivedContext } = formatReflectionInjectionContext({
        invariantItems: cachedItems.invariantItems,
        derivedItems: cachedItems.derivedItems,
      });

      // Combine contexts (invariant first, then derived)
      const combinedContext = [invariantContext, derivedContext].filter(Boolean).join('\n');
      if (!combinedContext) return undefined;

      api.logger.info?.(
        `[memory-lancedb-pro] reflection-inject: injecting ${cachedItems.invariantItems.length} invariant + ${cachedItems.derivedItems.length} derived items`
      );

      return { prependContext: combinedContext };
    } catch (err) {
      // Fail-safe: don't block agent startup on injection failure
      api.logger.warn?.(`[memory-lancedb-pro] reflection-inject failed: ${String(err)}`);
      return undefined;
    }
  });

  api.logger.info?.('[memory-lancedb-pro] reflection injector registered (disabled by default, reflection.enabled=false)');
}
