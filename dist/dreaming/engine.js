/**
 * Dreaming Engine — Three-Phase Sweep + Cron Scheduling
 *
 * Ported from upstream dreaming-engine.ts (32KB).
 * Three phases: light (dedup/merge), deep (promotion), rem (pattern insight).
 *
 * Design constraints (v2 performance lesson):
 * - dreaming.enabled defaults to false (zero overhead when disabled)
 * - sweep runs in paginated chunks (pageSize=100), each chunk yields to event loop
 * - cold-start overhead is deferred (not in plugin init path)
 * - scheduling uses setTimeout (unref), not external cron deps
 * - dreaming sub-sessions are blocked by M2 anti-recursion guard (dreaming: prefix)
 *
 * M3 integration:
 * - Reuses dist/reflection/decay.js for logistic decay computation
 * - Dreaming writes go through existing store serialization (source=dreaming-engine)
 * - Dreaming sub-sessions are subject to M2 anti-recursion guards
 */

import {
  normalizeDreamingConfig,
  parseDailyCron,
  computeNextDreamingDelayMs,
  MS_PER_DAY,
  DEFAULT_PAGE_SIZE,
  DREAMING_SOURCE_ALIASES,
  STORED_MEMORY_SOURCES,
  VALID_DREAMING_SOURCE_FILTERS,
  isRecord,
  normalizeDreamingSources,
  getZonedParts,
  DEFAULT_DREAMING_CONFIG,
} from './config.js';

// ── Smart Metadata Adapter ─────────────────────────────────────────────
// Minimal smart-metadata adapter for dreaming engine.
// We use a lightweight JSON-based approach compatible with our store schema,
// rather than the full upstream smart-metadata.ts (25KB).

function parseSmartMetadata(metadata, entry) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  if (typeof metadata === 'object') return metadata;
  return {};
}

function stringifySmartMetadata(obj) {
  if (!obj || typeof obj !== 'object') return '{}';
  return JSON.stringify(obj);
}

function buildSmartMetadata(entryLike, overrides) {
  const base = parseSmartMetadata(entryLike.metadata, entryLike);
  return { ...base, ...overrides };
}

function toLifecycleMemory(id, entry) {
  const metadata = parseSmartMetadata(entry.metadata, entry);
  return {
    id,
    importance: entry.importance ?? 0.5,
    confidence: metadata.confidence ?? 0.5,
    tier: metadata.tier ?? 'working',
    accessCount: metadata.access_count ?? 0,
    createdAt: entry.timestamp ?? Date.now(),
    lastAccessedAt: metadata.last_accessed_at ?? entry.timestamp ?? Date.now(),
    temporalType: metadata.memory_temporal_type,
  };
}

// ── Stop Words for REM Pattern Tokenization ────────────────────────────

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'between',
  'could', 'memory', 'should', 'their', 'there', 'these', 'those',
  'through', 'using', 'where', 'which', 'while', 'would',
]);

// ── Helpers ────────────────────────────────────────────────────────────

function emptyPhaseResult() {
  return { scanned: 0, changed: 0 };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function selectCanonical(a, b) {
  const score = (entry) =>
    (Number(entry.importance) || 0) * 10 +
    Math.min(2, Math.max(0, (entry.text?.length ?? 0) / 400)) +
    ((entry.timestamp || 0) / 10_000_000_000_000);
  return score(a) >= score(b) ? a : b;
}

function parseUniqueQueryCount(metadata) {
  const direct = metadata.unique_query_count ?? metadata.uniqueQueries ?? metadata.recall_unique_queries;
  if (typeof direct === 'number' && Number.isFinite(direct)) return Math.max(0, Math.floor(direct));
  if (Array.isArray(direct)) return direct.length;
  if (direct && typeof direct === 'object') return Object.keys(direct).length;
  const queryIds = metadata.recall_query_ids ?? metadata.query_ids;
  if (Array.isArray(queryIds)) return new Set(queryIds.filter((item) => typeof item === 'string')).size;
  return 0;
}

function isDreamingGenerated(entry) {
  const metadata = parseSmartMetadata(entry.metadata, entry);
  return metadata.source === 'dreaming-engine';
}

function isActiveUserMemory(entry, at) {
  const metadata = parseSmartMetadata(entry.metadata, entry);
  if (metadata.state === 'archived') return false;
  if (metadata.memory_layer === 'archive') return false;
  if (metadata.invalidated_at && metadata.invalidated_at <= at) return false;
  return !isDreamingGenerated(entry);
}

function entryMatchesSources(entry, sources) {
  if (!sources || sources.length === 0) return true;
  const metadata = parseSmartMetadata(entry.metadata, entry);
  const memoryCategory = typeof metadata.memory_category === 'string' ? metadata.memory_category : '';
  const memoryLayer = typeof metadata.memory_layer === 'string' ? metadata.memory_layer : '';
  const dreamingPhase = typeof metadata.dreaming_phase === 'string' ? metadata.dreaming_phase : '';

  return sources.some((source) => {
    const alias = DREAMING_SOURCE_ALIASES[source];
    if (alias) {
      return Boolean(
        alias.sources?.includes(metadata.source) ||
        alias.phases?.includes(dreamingPhase),
      );
    }
    return source === metadata.source ||
      source === entry.category ||
      source === memoryCategory ||
      source === memoryLayer ||
      source === dreamingPhase;
  });
}

function scoreDeepCandidate(entry, config, now) {
  const metadata = parseSmartMetadata(entry.metadata, entry);
  const ageDays = Math.max(0, (now - entry.timestamp) / MS_PER_DAY);
  const recency = Math.exp(-ageDays / Math.max(1, config.recencyHalfLifeDays));
  const access = Math.min(1, (metadata.access_count ?? 0) / Math.max(1, config.minRecallCount * 2));
  const confidence = clamp01(metadata.confidence ?? 0.5);
  const importance = clamp01(entry.importance ?? 0.5);
  return clamp01((importance * 0.45) + (confidence * 0.2) + (access * 0.25) + (recency * 0.1));
}

function tokenize(text) {
  const matches = (text ?? '').toLowerCase().match(/[\p{L}\p{N}_-]{4,}/gu) ?? [];
  return matches
    .map((item) => item.replace(/^[-_]+|[-_]+$/g, ''))
    .filter((item) => item.length >= 4 && !STOP_WORDS.has(item));
}

function addPatternCount(counts, key) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function buildPatterns(entries, minPatternStrength) {
  const total = Math.max(1, entries.length);
  const categoryCounts = new Map();
  const memoryCategoryCounts = new Map();
  const termCounts = new Map();

  for (const entry of entries) {
    const metadata = parseSmartMetadata(entry.metadata, entry);
    addPatternCount(categoryCounts, entry.category);
    addPatternCount(memoryCategoryCounts, metadata.memory_category);

    const terms = new Set(tokenize(`${metadata.l0_abstract ?? ''} ${entry.text ?? ''}`));
    for (const term of terms) {
      addPatternCount(termCounts, term);
    }
  }

  const build = (type, counts) =>
    [...counts.entries()]
      .map(([key, count]) => ({ type, key, count, strength: count / total }))
      .filter((pattern) => pattern.count >= 2 && pattern.strength >= minPatternStrength)
      .sort((a, b) => b.strength - a.strength || b.count - a.count || a.key.localeCompare(b.key));

  return [
    ...build('category', categoryCounts),
    ...build('memory_category', memoryCategoryCounts),
    ...build('term', termCounts),
  ].slice(0, 6);
}

function formatDateStamp(now, timezone) {
  const parts = getZonedParts(now, timezone);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

function phaseEnabled(config) {
  return config.enabled === true && (config.limit ?? 1) > 0;
}

/**
 * Yield to the event loop by resolving a microtask.
 * Used between paginated chunks to prevent blocking.
 */
function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ── Dreaming Engine Factory ────────────────────────────────────────────

/**
 * Create a dreaming engine instance.
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.store - Memory store (list, fetchForCompaction, patchMetadata, update, store, stats)
 * @param {Object} deps.embedder - Embedder (embed(text) → number[])
 * @param {Object} [deps.decayEngine] - Decay engine from M3 (optional, for light tier transitions)
 * @param {Object} [deps.tierManager] - Tier manager (optional, for light tier transitions)
 * @param {Object} [deps.config] - Partial dreaming config
 * @param {Function} [deps.getScopes] - Async function returning scope list
 * @param {Object} [deps.logger] - Logger (debug, info, warn)
 * @param {Function} [deps.now] - Time function (default: Date.now)
 * @returns {Object} DreamingEngine with start(), stop(), runSweep(), config
 */
export function createDreamingEngine(deps) {
  const config = normalizeDreamingConfig(deps.config);
  const now = deps.now ?? (() => Date.now());
  let stopped = false;
  let sweepTimer = null;

  const debug = (message) => {
    if (config.verboseLogging) deps.logger?.debug?.(message);
  };

  // ── Scope Resolution ─────────────────────────────────────────────

  async function resolveScopes(explicit) {
    const fromExplicit = explicit?.filter((scope) => typeof scope === 'string' && scope.trim().length > 0);
    if (fromExplicit && fromExplicit.length > 0) return [...new Set(fromExplicit.map((scope) => scope.trim()))];

    const fromHook = await deps.getScopes?.().catch(() => []);
    if (fromHook && fromHook.length > 0) {
      return [...new Set(fromHook.filter(Boolean).map((scope) => scope.trim()))];
    }

    const stats = await deps.store.stats().catch(() => ({ totalCount: 0, scopeCounts: {} }));
    const scopes = Object.keys(stats.scopeCounts).filter((scope) => scope.trim().length > 0);
    return scopes.length > 0 ? scopes.sort() : ['global'];
  }

  // ── Entry Collection (paginated, yields between chunks) ──────────

  async function collectListEntries(scope, limit, lookbackDays, sources) {
    const cutoff = lookbackDays === undefined ? Number.NEGATIVE_INFINITY : now() - (lookbackDays * MS_PER_DAY);
    const entries = [];
    let offset = 0;
    const pageSize = Math.max(DEFAULT_PAGE_SIZE, Math.min(250, Math.max(1, limit)));

    while (entries.length < limit) {
      const page = await deps.store.list([scope], undefined, pageSize, offset);
      if (page.length === 0) break;

      for (const entry of page) {
        if (entry.timestamp < cutoff) continue;
        if (!entryMatchesSources(entry, sources)) continue;
        if (!isActiveUserMemory(entry, now())) continue;
        entries.push(entry);
        if (entries.length >= limit) break;
      }

      if (page.length < pageSize) break;
      offset += pageSize;

      // Yield to event loop between pages (non-blocking)
      await yieldToEventLoop();
    }

    return entries;
  }

  async function collectVectorEntries(phaseConfig, scope) {
    if (!deps.store.fetchForCompaction) return [];
    const cutoff = now() - (phaseConfig.lookbackDays * MS_PER_DAY);
    const fetchLimit = Math.max(DEFAULT_PAGE_SIZE, phaseConfig.limit * 10, phaseConfig.limit);
    const entries = await deps.store.fetchForCompaction(now() + 1, [scope], fetchLimit);
    return entries
      .filter((entry) => entry.timestamp >= cutoff)
      .filter((entry) => entryMatchesSources(entry, phaseConfig.sources))
      .filter((entry) => isActiveUserMemory(entry, now()))
      .filter((entry) => Array.isArray(entry.vector) && entry.vector.length > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, phaseConfig.limit);
  }

  // ── Phase: Light (dedup/merge + tier transitions) ────────────────

  async function runLight(scope) {
    const phase = config.phases.light;
    if (!phaseEnabled(phase)) return emptyPhaseResult();

    const vectorEntries = await collectVectorEntries(phase, scope);
    const archivedIds = new Set();
    let archived = 0;

    for (let i = 0; i < vectorEntries.length; i++) {
      const a = vectorEntries[i];
      if (archivedIds.has(a.id)) continue;
      for (let j = i + 1; j < vectorEntries.length; j++) {
        const b = vectorEntries[j];
        if (archivedIds.has(b.id)) continue;
        if (a.category !== b.category) continue;
        const similarity = cosineSimilarity(a.vector, b.vector);
        if (similarity < phase.dedupeSimilarity) continue;

        const canonical = selectCanonical(a, b);
        const duplicate = canonical.id === a.id ? b : a;
        const archivedAt = now();
        const patched = await deps.store.patchMetadata(
          duplicate.id,
          {
            state: 'archived',
            memory_layer: 'archive',
            invalidated_at: archivedAt,
            canonical_id: canonical.id,
            dreaming_phase: 'light',
            dreaming_archived_at: archivedAt,
            dreaming_archive_reason: `duplicate similarity ${similarity.toFixed(3)}`,
          },
          [scope],
        );
        if (patched) {
          archived += 1;
          archivedIds.add(duplicate.id);
          if (duplicate.id === a.id) break;
        }
      }
      // Yield between outer loop iterations
      await yieldToEventLoop();
    }

    const listEntries = await collectListEntries(scope, phase.limit, phase.lookbackDays, phase.sources);
    let tierTransitions = 0;
    for (const entry of listEntries) {
      if (archivedIds.has(entry.id)) continue;
      const metadata = parseSmartMetadata(entry.metadata, entry);
      const lifecycle = toLifecycleMemory(entry.id, entry);

      // Use M3 decay engine if available, otherwise skip tier transitions
      const score = deps.decayEngine?.score(lifecycle, now());
      const transition = score
        ? deps.tierManager?.evaluate(lifecycle, score, now())
        : null;
      if (!transition || transition.toTier === metadata.tier) continue;

      const patched = await deps.store.patchMetadata(
        entry.id,
        {
          tier: transition.toTier,
          dreaming_phase: 'light',
          dreaming_last_light_at: now(),
          dreaming_tier_reason: transition.reason,
        },
        [scope],
      );
      if (patched) tierTransitions += 1;
    }

    return {
      scanned: Math.max(vectorEntries.length, listEntries.length),
      changed: archived + tierTransitions,
      archived,
      tierTransitions,
    };
  }

  // ── Phase: Deep (promotion) ──────────────────────────────────────

  async function runDeep(scope) {
    const phase = config.phases.deep;
    if (!phaseEnabled(phase)) return emptyPhaseResult();

    const entries = await collectListEntries(
      scope, Math.max(phase.limit * 6, phase.limit), phase.maxAgeDays, phase.sources,
    );
    let promoted = 0;

    for (const entry of entries) {
      if (promoted >= phase.limit) break;
      const metadata = parseSmartMetadata(entry.metadata, entry);
      if (metadata.tier === 'core' || metadata.memory_layer === 'durable') continue;
      if ((metadata.access_count ?? 0) < phase.minRecallCount) continue;
      if (parseUniqueQueryCount(metadata) < phase.minUniqueQueries) continue;

      const score = scoreDeepCandidate(entry, phase, now());
      if (score < phase.minScore) continue;

      const promotedMetadata = buildSmartMetadata(
        entry,
        {
          tier: 'core',
          memory_layer: 'durable',
          dreaming_phase: 'deep',
          dreaming_promoted_at: now(),
          dreaming_deep_score: Number(score.toFixed(4)),
        },
      );
      const updated = await deps.store.update(
        entry.id,
        {
          importance: Math.max(entry.importance, Math.min(0.98, Math.max(entry.importance, score) + 0.05)),
          metadata: stringifySmartMetadata(promotedMetadata),
        },
        [scope],
      );
      if (!updated) continue;
      promoted += 1;

      // Yield between promotions
      await yieldToEventLoop();
    }

    return {
      scanned: entries.length,
      changed: promoted,
      promoted,
    };
  }

  // ── Phase: REM (pattern insight) ─────────────────────────────────

  async function runRem(scope) {
    const phase = config.phases.rem;
    if (!phaseEnabled(phase)) return emptyPhaseResult();

    const entries = await collectListEntries(scope, phase.limit, phase.lookbackDays, phase.sources);
    const patterns = buildPatterns(entries, phase.minPatternStrength);
    if (patterns.length === 0) {
      return { scanned: entries.length, changed: 0, created: 0, patterns: [] };
    }

    const dateStamp = formatDateStamp(now(), config.timezone);
    const recentReflections = await deps.store.list([scope], 'reflection', 25, 0).catch(() => []);
    const alreadyStored = recentReflections.some((entry) => {
      const metadata = parseSmartMetadata(entry.metadata, entry);
      return metadata.source === 'dreaming-engine' &&
        metadata.dreaming_phase === 'rem' &&
        metadata.dream_date === dateStamp;
    });
    if (alreadyStored) {
      return { scanned: entries.length, changed: 0, created: 0, patterns };
    }

    const lines = patterns.map((pattern) =>
      `- ${pattern.type} "${pattern.key}" appears in ${pattern.count}/${entries.length} memories (strength ${pattern.strength.toFixed(2)}).`,
    );
    const text = [
      `Dreaming REM reflection for scope "${scope}" on ${dateStamp}.`,
      '',
      'Observed recurring memory patterns:',
      ...lines,
    ].join('\n');

    const vector = await deps.embedder.embed(text);
    const metadata = buildSmartMetadata(
      { text, category: 'reflection', importance: 0.55, timestamp: now() },
      {
        source: 'dreaming-engine',
        state: 'confirmed',
        memory_layer: 'reflection',
        tier: 'working',
        memory_category: 'patterns',
        dreaming_phase: 'rem',
        dream_date: dateStamp,
        dream_timestamp: now(),
        patterns_count: patterns.length,
        memories_analyzed: entries.length,
      },
    );

    await deps.store.store({
      text,
      vector,
      category: 'reflection',
      scope,
      importance: 0.55,
      metadata: stringifySmartMetadata(metadata),
    });

    return { scanned: entries.length, changed: 1, created: 1, patterns };
  }

  // ── Phase Dispatcher ─────────────────────────────────────────────

  async function runPhase(phase, scope) {
    if (phase === 'light') return runLight(scope);
    if (phase === 'deep') return runDeep(scope);
    return runRem(scope);
  }

  // ── Scheduling ───────────────────────────────────────────────────

  function scheduleNextSweep() {
    if (stopped || !config.enabled) return;

    const delayMs = computeNextDreamingDelayMs(config.frequency, config.timezone, now());
    debug(`memory-lancedb-pro: dreaming next sweep in ${Math.round(delayMs / 1000)}s`);

    sweepTimer = setTimeout(async () => {
      if (stopped || !config.enabled) return;
      try {
        await engine.runSweep();
      } catch (err) {
        deps.logger?.warn?.(`memory-lancedb-pro: dreaming sweep failed: ${String(err)}`);
      }
      // Schedule next sweep after this one completes
      scheduleNextSweep();
    }, delayMs);

    // Unref so the timer doesn't keep the process alive
    if (sweepTimer && typeof sweepTimer.unref === 'function') {
      sweepTimer.unref();
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  const engine = {
    config,

    start() {
      stopped = false;
      if (config.enabled) {
        scheduleNextSweep();
      }
    },

    stop() {
      stopped = true;
      if (sweepTimer) {
        clearTimeout(sweepTimer);
        sweepTimer = null;
      }
    },

    async runSweep(explicitScopes) {
      const startedAt = now();
      const result = {
        enabled: config.enabled,
        startedAt,
        finishedAt: startedAt,
        scopes: [],
        phases: {
          light: emptyPhaseResult(),
          deep: emptyPhaseResult(),
          rem: emptyPhaseResult(),
        },
        errors: [],
      };

      if (!config.enabled || stopped) {
        result.finishedAt = now();
        return result;
      }

      const scopes = await resolveScopes(explicitScopes);
      result.scopes = scopes;
      debug(`memory-lancedb-pro: dreaming sweep started for scopes: ${scopes.join(', ')}`);
      if (config.verboseLogging) {
        deps.logger?.info?.(`memory-lancedb-pro: dreaming sweep started (scopes=${scopes.length})`);
      }

      for (const scope of scopes) {
        if (stopped) break;
        for (const phase of ['light', 'deep', 'rem']) {
          if (stopped) break;
          try {
            const phaseResult = await runPhase(phase, scope);
            result.phases[phase].scanned += phaseResult.scanned;
            result.phases[phase].changed += phaseResult.changed;
            result.phases[phase].created = (result.phases[phase].created ?? 0) + (phaseResult.created ?? 0);
            result.phases[phase].archived = (result.phases[phase].archived ?? 0) + (phaseResult.archived ?? 0);
            result.phases[phase].promoted = (result.phases[phase].promoted ?? 0) + (phaseResult.promoted ?? 0);
            result.phases[phase].tierTransitions =
              (result.phases[phase].tierTransitions ?? 0) + (phaseResult.tierTransitions ?? 0);
            if (phaseResult.patterns?.length) {
              result.phases[phase].patterns = [
                ...(result.phases[phase].patterns ?? []),
                ...phaseResult.patterns,
              ];
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.errors.push({ scope, phase, message });
            deps.logger?.warn?.(`memory-lancedb-pro: dreaming ${phase} phase failed for scope ${scope}: ${message}`);
          }
        }
      }

      result.finishedAt = now();
      debug(
        `memory-lancedb-pro: dreaming sweep finished ` +
        `(changed=${Object.values(result.phases).reduce((sum, p) => sum + p.changed, 0)}, errors=${result.errors.length})`,
      );
      if (config.verboseLogging) {
        deps.logger?.info?.(
          `memory-lancedb-pro: dreaming sweep finished (scopes=${result.scopes.length}, ` +
          `changed=${Object.values(result.phases).reduce((sum, p) => sum + p.changed, 0)}, errors=${result.errors.length})`,
        );
      }
      return result;
    },
  };
  return engine;
}

// ── Re-exports for testing ─────────────────────────────────────────────

export {
  normalizeDreamingConfig,
  parseDailyCron,
  computeNextDreamingDelayMs,
  DEFAULT_DREAMING_CONFIG,
  DREAMING_SOURCE_ALIASES,
  STORED_MEMORY_SOURCES,
  VALID_DREAMING_SOURCE_FILTERS,
  cosineSimilarity,
  entryMatchesSources,
  isDreamingGenerated,
  isActiveUserMemory,
  scoreDeepCandidate,
  buildPatterns,
  tokenize,
  parseSmartMetadata,
  stringifySmartMetadata,
  buildSmartMetadata,
  toLifecycleMemory,
  selectCanonical,
  parseUniqueQueryCount,
  phaseEnabled,
  formatDateStamp,
  STOP_WORDS,
};
