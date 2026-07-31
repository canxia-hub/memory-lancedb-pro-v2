/**
 * Reflection Admission Control — Admission gating for reflection mapped rows.
 *
 * Ported from upstream admission-control.ts + reflection-mapped-admission.ts.
 * Simplified: no LLM-based utility scoring (our distiller already filters),
 * but full type-prior / confidence / novelty / recency scoring preserved.
 *
 * In our architecture, admission control is a lightweight gate:
 * - When disabled (default): passthrough (identical to historical behavior)
 * - When enabled: type-prior + confidence + novelty scoring
 */

// ── Types & Constants ──────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  utility: 0.1,
  confidence: 0.1,
  novelty: 0.1,
  recency: 0.1,
  typePrior: 0.6,
};

const DEFAULT_TYPE_PRIORS = {
  profile: 0.95,
  preferences: 0.9,
  entities: 0.75,
  events: 0.45,
  cases: 0.8,
  patterns: 0.85,
};

const ADMISSION_CONTROL_PRESETS = {
  balanced: {
    preset: 'balanced',
    enabled: false,
    weights: { ...DEFAULT_WEIGHTS },
    rejectThreshold: 0.45,
    admitThreshold: 0.6,
    noveltyCandidatePoolSize: 8,
    recency: { halfLifeDays: 14 },
    typePriors: { ...DEFAULT_TYPE_PRIORS },
    auditMetadata: true,
  },
  conservative: {
    preset: 'conservative',
    enabled: false,
    weights: { utility: 0.16, confidence: 0.16, novelty: 0.18, recency: 0.08, typePrior: 0.42 },
    rejectThreshold: 0.52,
    admitThreshold: 0.68,
    noveltyCandidatePoolSize: 10,
    recency: { halfLifeDays: 10 },
    typePriors: { profile: 0.98, preferences: 0.94, entities: 0.78, events: 0.28, cases: 0.78, patterns: 0.8 },
    auditMetadata: true,
  },
  'high-recall': {
    preset: 'high-recall',
    enabled: false,
    weights: { utility: 0.08, confidence: 0.1, novelty: 0.08, recency: 0.14, typePrior: 0.6 },
    rejectThreshold: 0.34,
    admitThreshold: 0.52,
    noveltyCandidatePoolSize: 6,
    recency: { halfLifeDays: 21 },
    typePriors: { profile: 0.96, preferences: 0.92, entities: 0.8, events: 0.58, cases: 0.84, patterns: 0.88 },
    auditMetadata: true,
  },
};

export const DEFAULT_ADMISSION_CONTROL_CONFIG = ADMISSION_CONTROL_PRESETS.balanced;

/**
 * Map reflection mapped category to smart register for type-prior scoring.
 * @param {string} category
 * @returns {string}
 */
export function mapReflectionMappedCategoryToSmartRegister(category) {
  switch (category) {
    case 'preference': return 'preferences';
    case 'fact': return 'cases';
    case 'decision': return 'events';
    default: return 'events';
  }
}

/**
 * Normalize admission control config from raw plugin config.
 * @param {unknown} raw
 * @returns {object}
 */
export function normalizeAdmissionControlConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_ADMISSION_CONTROL_CONFIG };
  }

  const obj = raw;
  const preset = typeof obj.preset === 'string' && ADMISSION_CONTROL_PRESETS[obj.preset]
    ? obj.preset
    : 'balanced';
  const base = { ...ADMISSION_CONTROL_PRESETS[preset] };

  return {
    ...base,
    preset,
    enabled: obj.enabled === true,
    auditMetadata: typeof obj.auditMetadata === 'boolean' ? obj.auditMetadata : base.auditMetadata,
  };
}

/**
 * Gate mapped reflection entries through admission control.
 * When no controller (admission disabled): passthrough.
 *
 * @param {Object} params
 * @param {object|null} params.admissionController
 * @param {boolean} params.attachAudit
 * @param {Array<{text: string, category: string, heading: string, vector: number[]}>} params.rows
 * @param {string} params.conversationText
 * @param {string[]} params.scopeFilter
 * @param {(msg: string) => void} [params.warnLog]
 * @returns {Promise<Array<{admit: boolean, reason?: string, auditJson?: string}>>}
 */
export async function gateMappedReflectionEntries(params) {
  const { admissionController, rows } = params;
  if (rows.length === 0) return [];
  if (!admissionController) {
    return rows.map(() => ({ admit: true }));
  }

  // With controller: evaluate each row
  const results = [];
  for (const row of rows) {
    try {
      const evaluation = await admissionController.evaluate({
        candidate: {
          category: mapReflectionMappedCategoryToSmartRegister(row.category),
          abstract: row.text,
          overview: `## ${row.heading}`,
          content: row.text,
        },
        candidateVector: row.vector,
        conversationText: params.conversationText,
        scopeFilter: params.scopeFilter,
      });

      if (evaluation.decision === 'reject') {
        results.push({ admit: false, reason: evaluation.audit?.reason });
      } else {
        const auditJson = params.attachAudit
          ? JSON.stringify({ ...evaluation.audit, provenance: 'memory-reflection-mapped' })
          : undefined;
        results.push({ admit: true, auditJson });
      }
    } catch (err) {
      params.warnLog?.(
        `memory-reflection: mapped-row admission evaluation failed, admitting without audit: ${String(err)}`,
      );
      results.push({
        admit: true,
        reason: 'admission evaluation failed open',
        auditJson: params.attachAudit
          ? JSON.stringify({ provenance: 'memory-reflection-mapped', failedOpen: true, error: String(err) })
          : undefined,
      });
    }
  }
  return results;
}
