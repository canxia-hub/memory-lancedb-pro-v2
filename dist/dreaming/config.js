/**
 * Dreaming Engine — Configuration Normalization & Scheduling
 *
 * Ported from upstream dreaming-engine.ts (config normalization, cron parsing,
 * next-delay computation). Provides:
 * - normalizeDreamingConfig: validates and fills defaults for dreaming config
 * - parseDailyCron: parses "@daily" or "M H * * *" cron expressions
 * - computeNextDreamingDelayMs: calculates ms until next scheduled sweep
 *
 * Design constraints (v2 performance lesson):
 * - dreaming.enabled defaults to false (zero overhead when disabled)
 * - Only daily cron expressions supported (no arbitrary schedules)
 * - timezone defaults to Asia/Shanghai per spec §3.3
 */

// ── Constants ──────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const DEFAULT_FREQUENCY = '0 3 * * *';
const DEFAULT_PAGE_SIZE = 100;

const STORED_MEMORY_SOURCES = [
  'manual',
  'auto-capture',
  'reflection',
  'dreaming-engine',
  'session-summary',
  'legacy',
];

const DREAMING_SOURCE_ALIASES = {
  daily: { sources: ['manual', 'auto-capture', 'legacy'] },
  sessions: { sources: ['session-summary'] },
  recall: { sources: ['manual', 'auto-capture', 'legacy'] },
  logs: { sources: ['auto-capture'] },
  memory: { sources: ['manual', 'auto-capture', 'legacy'] },
  deep: { phases: ['deep'] },
};

const MEMORY_CATEGORIES = [
  'preference', 'fact', 'decision', 'entity', 'reflection', 'other',
];

const LEGACY_MEMORY_CATEGORIES = [
  'invariant', 'derived', 'user-model', 'agent-model', 'lesson', 'patterns',
];

const VALID_DREAMING_SOURCE_FILTERS = new Set([
  ...Object.keys(DREAMING_SOURCE_ALIASES),
  ...STORED_MEMORY_SOURCES,
  ...MEMORY_CATEGORIES,
  ...LEGACY_MEMORY_CATEGORIES,
]);

// ── Default Config ─────────────────────────────────────────────────────

export const DEFAULT_DREAMING_CONFIG = {
  enabled: false,
  frequency: DEFAULT_FREQUENCY,
  timezone: 'Asia/Shanghai',
  verboseLogging: false,
  phases: {
    light: {
      enabled: true,
      lookbackDays: 2,
      limit: 100,
      dedupeSimilarity: 0.92,
    },
    deep: {
      enabled: true,
      limit: 10,
      minScore: 0.6,
      minRecallCount: 3,
      minUniqueQueries: 0,
      recencyHalfLifeDays: 14,
      maxAgeDays: 90,
    },
    rem: {
      enabled: true,
      lookbackDays: 7,
      limit: 10,
      minPatternStrength: 0.6,
    },
  },
};

// ── Type Guards & Coercion ─────────────────────────────────────────────

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asPositiveInt(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return undefined;
}

function asNonNegativeInt(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return undefined;
}

function asNumberInRange(value, min, max) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

// ── Source Normalization ───────────────────────────────────────────────

function normalizeDreamingSources(value) {
  if (!Array.isArray(value)) return undefined;
  const values = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) continue;
    const normalized = item.trim().toLowerCase();
    if (!VALID_DREAMING_SOURCE_FILTERS.has(normalized)) {
      throw new Error(
        `Unsupported dreaming source filter "${item}". ` +
        `Supported filters: ${[...VALID_DREAMING_SOURCE_FILTERS].sort().join(', ')}`,
      );
    }
    if (!values.includes(normalized)) values.push(normalized);
  }
  return values.length > 0 ? values : undefined;
}

// ── Phase Normalizers ──────────────────────────────────────────────────

function normalizeLight(raw) {
  const cfg = isRecord(raw) ? raw : {};
  return {
    enabled: cfg.enabled !== false,
    lookbackDays: asNonNegativeInt(cfg.lookbackDays) ?? DEFAULT_DREAMING_CONFIG.phases.light.lookbackDays,
    limit: asNonNegativeInt(cfg.limit) ?? DEFAULT_DREAMING_CONFIG.phases.light.limit,
    dedupeSimilarity:
      asNumberInRange(cfg.dedupeSimilarity, 0, 1) ??
      DEFAULT_DREAMING_CONFIG.phases.light.dedupeSimilarity,
    sources: normalizeDreamingSources(cfg.sources),
  };
}

function normalizeDeep(raw) {
  const cfg = isRecord(raw) ? raw : {};
  return {
    enabled: cfg.enabled !== false,
    limit: asNonNegativeInt(cfg.limit) ?? DEFAULT_DREAMING_CONFIG.phases.deep.limit,
    minScore: asNumberInRange(cfg.minScore, 0, 1) ?? DEFAULT_DREAMING_CONFIG.phases.deep.minScore,
    minRecallCount:
      asNonNegativeInt(cfg.minRecallCount) ??
      DEFAULT_DREAMING_CONFIG.phases.deep.minRecallCount,
    minUniqueQueries:
      asNonNegativeInt(cfg.minUniqueQueries) ??
      DEFAULT_DREAMING_CONFIG.phases.deep.minUniqueQueries,
    recencyHalfLifeDays:
      asPositiveInt(cfg.recencyHalfLifeDays) ??
      DEFAULT_DREAMING_CONFIG.phases.deep.recencyHalfLifeDays,
    maxAgeDays: asPositiveInt(cfg.maxAgeDays) ?? DEFAULT_DREAMING_CONFIG.phases.deep.maxAgeDays,
    sources: normalizeDreamingSources(cfg.sources),
  };
}

function normalizeRem(raw) {
  const cfg = isRecord(raw) ? raw : {};
  return {
    enabled: cfg.enabled !== false,
    lookbackDays: asNonNegativeInt(cfg.lookbackDays) ?? DEFAULT_DREAMING_CONFIG.phases.rem.lookbackDays,
    limit: asNonNegativeInt(cfg.limit) ?? DEFAULT_DREAMING_CONFIG.phases.rem.limit,
    minPatternStrength:
      asNumberInRange(cfg.minPatternStrength, 0, 1) ??
      DEFAULT_DREAMING_CONFIG.phases.rem.minPatternStrength,
    sources: normalizeDreamingSources(cfg.sources),
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Normalize and validate dreaming configuration.
 *
 * @param {unknown} value - Raw dreaming config from plugin config
 * @returns {Object} Normalized DreamingConfig
 * @throws {Error} If enabled=true but frequency is not a valid daily cron
 */
export function normalizeDreamingConfig(value) {
  const raw = isRecord(value) ? value : {};
  const phases = isRecord(raw.phases) ? raw.phases : {};
  const frequency = typeof raw.frequency === 'string' && raw.frequency.trim()
    ? raw.frequency.trim()
    : DEFAULT_DREAMING_CONFIG.frequency;

  // Validate cron expression when enabled
  if (raw.enabled === true && !parseDailyCron(frequency)) {
    throw new Error(
      `Unsupported dreaming.frequency "${frequency}". Use "@daily" or a daily cron expression like "0 3 * * *".`,
    );
  }

  return {
    enabled: raw.enabled === true,
    frequency,
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim()
      ? raw.timezone.trim()
      : DEFAULT_DREAMING_CONFIG.timezone,
    verboseLogging: raw.verboseLogging === true,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : undefined,
    storage: isRecord(raw.storage) ? raw.storage : undefined,
    execution: isRecord(raw.execution) ? raw.execution : undefined,
    phases: {
      light: normalizeLight(phases.light),
      deep: normalizeDeep(phases.deep),
      rem: normalizeRem(phases.rem),
    },
  };
}

/**
 * Parse a daily cron expression.
 *
 * Supported formats:
 * - "@daily" → { minute: 0, hour: 0 }
 * - "M H * * *" → { minute: M, hour: H }
 *
 * @param {string|undefined} value - Cron expression
 * @returns {{ minute: number, hour: number }|null} Parsed result or null
 */
export function parseDailyCron(value) {
  const raw = (value || DEFAULT_FREQUENCY).trim();
  if (raw === '@daily') return { minute: 0, hour: 0 };

  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(raw);
  if (!match) return null;

  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  return { minute, hour };
}

// ── Timezone Helpers ───────────────────────────────────────────────────

function getZonedParts(ms, timezone) {
  if (!timezone) {
    const date = new Date(ms);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    const hour = pick('hour');
    const minute = pick('minute');
    if ([year, month, day, hour, minute].every(Number.isFinite)) {
      return { year, month, day, hour, minute };
    }
  } catch {
    // Fall back to UTC
  }

  return getZonedParts(ms);
}

function getTimezoneOffsetMs(timezone, date) {
  if (!timezone) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(
      pick('year'),
      pick('month') - 1,
      pick('day'),
      pick('hour'),
      pick('minute'),
      pick('second'),
    );
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

function zonedLocalToUtcMs(year, month, day, hour, minute, timezone) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  if (!timezone) return utc;

  // Iterate twice to handle DST edge cases
  for (let i = 0; i < 2; i++) {
    const offset = getTimezoneOffsetMs(timezone, new Date(utc));
    utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }
  return utc;
}

/**
 * Compute the delay in milliseconds until the next scheduled dreaming sweep.
 *
 * @param {string|undefined} frequency - Cron expression
 * @param {string|undefined} timezone - IANA timezone string
 * @param {number} [nowMs=Date.now()] - Current time in ms
 * @returns {number} Delay in ms (minimum 1000ms)
 */
export function computeNextDreamingDelayMs(frequency, timezone, nowMs) {
  const cron = parseDailyCron(frequency);
  if (!cron) return MS_PER_DAY;

  const now = nowMs ?? Date.now();
  const parts = getZonedParts(now, timezone);

  let candidate = zonedLocalToUtcMs(
    parts.year,
    parts.month,
    parts.day,
    cron.hour,
    cron.minute,
    timezone,
  );

  // If today's scheduled time has already passed (or is within 500ms), schedule for tomorrow
  if (candidate <= now + 500) {
    const tomorrowUtc = Date.UTC(parts.year, parts.month - 1, parts.day) + MS_PER_DAY;
    const tomorrow = new Date(tomorrowUtc);
    candidate = zonedLocalToUtcMs(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      cron.hour,
      cron.minute,
      timezone,
    );
  }

  return Math.max(1_000, candidate - now);
}

// ── Exports for engine ─────────────────────────────────────────────────

export {
  MS_PER_DAY,
  DEFAULT_FREQUENCY,
  DEFAULT_PAGE_SIZE,
  STORED_MEMORY_SOURCES,
  DREAMING_SOURCE_ALIASES,
  VALID_DREAMING_SOURCE_FILTERS,
  isRecord,
  asPositiveInt,
  asNonNegativeInt,
  asNumberInRange,
  normalizeDreamingSources,
  getZonedParts,
  getTimezoneOffsetMs,
  zonedLocalToUtcMs,
};
