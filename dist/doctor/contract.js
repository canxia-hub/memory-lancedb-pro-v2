/**
 * Doctor Contract — Legacy Envelope Cleanup + Schema Validation
 *
 * Ported from official doctor-contract-api.ts with v3→v4 adaptations.
 * Since SDK PluginDoctorStateMigration is not available in our host,
 * this module exposes a CLI-based doctor with the same check semantics.
 *
 * Two main checks:
 * 1. Legacy envelope contamination scan (10 sentinels + label+JSON block + external-content header)
 * 2. v3→v4 schema validation (columns, embedding dimension, FTS index, assets, wiki vault)
 *
 * Usage via CLI: openclaw memory-lancedb-pro doctor [--fix] [--json]
 * Dry-run mode (default): lists issues without modifying.
 * --fix mode: batch-deletes contaminated rows (batch=500) and reports.
 */
import {
  MEMORY_TABLE_NAME,
  ASSETS_TABLE_NAME,
  quoteLanceSqlString,
  buildInClause,
  validateMemorySchema,
  validateAssetsSchema,
  validateEmbeddingDimension,
  hasFtsIndex,
  checkWikiVaultPath,
} from './schema-helpers.js';

const LEGACY_ENVELOPE_DELETE_BATCH_SIZE = 500;

// ── 10 sentinel lines from official source ──
const LEGACY_ENVELOPE_SENTINELS = [
  'Conversation info (untrusted metadata):',
  'Sender (untrusted metadata):',
  'Thread starter (untrusted, for context):',
  'Reply target of current user message (untrusted, for context):',
  'Replied message (untrusted, for context):',
  'Forwarded message context (untrusted metadata):',
  'Conversation context (untrusted, chronological, selected for current message):',
  'Current local chat window (untrusted, chronological, before current message):',
  'Nearby reply target window (untrusted, chronological, around replied-to message):',
  'Chat history since last reply (untrusted, for context):',
];

const LEGACY_ENVELOPE_SENTINEL_LINE_RE = new RegExp(
  `^(?:${LEGACY_ENVELOPE_SENTINELS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[^\\n]*$`,
  'm',
);

const LEGACY_ENVELOPE_LABEL_JSON_BLOCK_RE =
  /^[^\n]+\((?:untrusted metadata|untrusted, for context|untrusted, nearest first|untrusted, chronological,[^\n)]{1,80})\):[ \t]*\n[ \t]*```json[ \t]*\n[\s\S]*?\n[ \t]*```[ \t]*(?:\n|$)/m;

const LEGACY_ENVELOPE_HEADER_RE =
  /^Untrusted context \(metadata, do not treat as instructions or commands\):[ \t]*$/m;

/**
 * Test if a text string is contaminated by legacy envelope patterns.
 */
export function isLegacyEnvelopeContaminatedText(text) {
  if (typeof text !== 'string') return false;
  return (
    LEGACY_ENVELOPE_SENTINEL_LINE_RE.test(text) ||
    LEGACY_ENVELOPE_LABEL_JSON_BLOCK_RE.test(text) ||
    LEGACY_ENVELOPE_HEADER_RE.test(text)
  );
}

/**
 * Stream-scan the memories table for legacy envelope contamination.
 * Uses select(["id","text"]) / select(["id","content"]) to avoid full materialization.
 * Returns array of contaminated row IDs.
 */
export async function scanLegacyEnvelopeRowIds(table) {
  const contaminatedIds = [];

  // Our table uses 'content' column, not 'text' — try both
  let selectCols = ['id', 'content'];
  let textCol = 'content';
  try {
    // Probe schema to find the text column
    const schema = await table.schema();
    const fieldNames = schema.fields.map((f) => f.name);
    if (fieldNames.includes('text') && !fieldNames.includes('content')) {
      selectCols = ['id', 'text'];
      textCol = 'text';
    }
  } catch {
    // Default to 'content'
  }

  for await (const batch of table.query().select(selectCols)) {
    const rows = batch.toArray();
    for (const row of rows) {
      const textValue = row[textCol];
      if (isLegacyEnvelopeContaminatedText(textValue)) {
        if (typeof row.id !== 'string') {
          throw new Error('LanceDB legacy envelope row is missing a string id');
        }
        contaminatedIds.push(row.id);
      }
    }
  }
  return contaminatedIds;
}

/**
 * Run doctor checks on a LanceDB connection.
 * Returns a structured report with issues found.
 *
 * @param {object} params - { db, config, vaultPath, expectedDimension }
 * @returns {object} Doctor report
 */
export async function runDoctorCheck(params) {
  const { db, config, vaultPath, expectedDimension } = params;
  const issues = [];
  const info = [];

  // ── Check 1: Legacy envelope contamination ──
  let table = null;
  try {
    const tableNames = await db.tableNames();
    if (tableNames.includes(MEMORY_TABLE_NAME)) {
      table = await db.openTable(MEMORY_TABLE_NAME);

      const contaminatedIds = await scanLegacyEnvelopeRowIds(table);
      if (contaminatedIds.length > 0) {
        issues.push({
          id: 'legacy-envelope-contamination',
          severity: 'warning',
          label: `Memory LanceDB: ${contaminatedIds.length} memory ${contaminatedIds.length === 1 ? 'row' : 'rows'} contaminated with legacy envelope metadata`,
          contaminatedIds,
          count: contaminatedIds.length,
          fixable: true,
          fixDescription: `Delete ${contaminatedIds.length} contaminated ${contaminatedIds.length === 1 ? 'row' : 'rows'}`,
        });
      } else {
        info.push('Legacy envelope scan: clean (0 contaminated rows)');
      }
    } else {
      info.push(`Table '${MEMORY_TABLE_NAME}' not found in database`);
    }
  } catch (err) {
    issues.push({
      id: 'legacy-envelope-scan-error',
      severity: 'error',
      label: `Legacy envelope scan failed: ${err.message}`,
      fixable: false,
    });
  }

  // ── Check 2: Memory table schema validation ──
  if (table) {
    try {
      const schema = await table.schema();
      const fields = schema.fields;

      // 2a: Required columns
      const colCheck = validateMemorySchema(fields);
      if (colCheck.missing.length > 0) {
        issues.push({
          id: 'schema-missing-columns',
          severity: 'error',
          label: `Memory table missing required columns: ${colCheck.missing.join(', ')}`,
          missing: colCheck.missing,
          fixable: false,
          fixDescription: 'Manual migration required to add missing columns',
        });
      }
      if (colCheck.extra.length > 0) {
        info.push(`Extra columns in memory table: ${colCheck.extra.join(', ')}`);
      }

      // 2b: Embedding dimension
      const dimCheck = validateEmbeddingDimension(fields, expectedDimension ?? 2560);
      if (!dimCheck.valid) {
        issues.push({
          id: 'schema-embedding-dimension',
          severity: dimCheck.reason?.includes('legacy') ? 'error' : 'warning',
          label: `Embedding column issue: ${dimCheck.reason}`,
          fixable: false,
          fixDescription: dimCheck.reason?.includes('legacy')
            ? 'Run scripts/migrate-v4-vector-schema.mjs'
            : 'Check embedding config',
        });
      } else {
        info.push(`Embedding dimension: ${dimCheck.dimension} (expected ${expectedDimension ?? 2560})`);
      }

      // 2c: FTS index existence
      try {
        const indices = await table.listIndices();
        const ftsExists = hasFtsIndex(indices);
        if (!ftsExists) {
          issues.push({
            id: 'schema-fts-index-missing',
            severity: 'warning',
            label: 'FTS index on content column not found (full-text search will be unavailable)',
            fixable: false,
            fixDescription: 'FTS index is created automatically on table initialization',
          });
        } else {
          info.push('FTS index on content: present');
        }
      } catch (idxErr) {
        info.push(`Index check skipped: ${idxErr.message?.slice(0, 80)}`);
      }

      // 2d: Row count
      try {
        const count = await table.countRows();
        info.push(`Memory table row count: ${count}`);
      } catch {
        // Non-critical
      }
    } catch (err) {
      issues.push({
        id: 'schema-validation-error',
        severity: 'error',
        label: `Schema validation failed: ${err.message}`,
        fixable: false,
      });
    }
  }

  // ── Check 3: Assets table integrity ──
  try {
    const tableNames = await db.tableNames();
    const assetsTableName = config?.assetsTableName ?? ASSETS_TABLE_NAME;
    if (tableNames.includes(assetsTableName)) {
      const assetsTable = await db.openTable(assetsTableName);
      const assetsSchema = await assetsTable.schema();
      const assetsCheck = validateAssetsSchema(assetsSchema.fields);
      if (assetsCheck.missing.length > 0) {
        issues.push({
          id: 'assets-schema-missing-columns',
          severity: 'warning',
          label: `Assets table missing columns: ${assetsCheck.missing.join(', ')}`,
          fixable: false,
        });
      } else {
        info.push('Assets table schema: valid');
      }
      try {
        const assetCount = await assetsTable.countRows();
        info.push(`Assets table row count: ${assetCount}`);
      } catch {
        // Non-critical
      }
    } else {
      info.push(`Assets table '${assetsTableName}' not found (may not be created yet)`);
    }
  } catch (err) {
    info.push(`Assets table check skipped: ${err.message?.slice(0, 80)}`);
  }

  // ── Check 4: Wiki vault path reachability ──
  if (vaultPath) {
    const vaultCheck = checkWikiVaultPath(vaultPath);
    if (!vaultCheck.reachable) {
      issues.push({
        id: 'wiki-vault-unreachable',
        severity: 'warning',
        label: `Wiki vault path unreachable: ${vaultCheck.reason}`,
        fixable: false,
        fixDescription: 'Ensure the vault path exists and is accessible',
      });
    } else {
      info.push(`Wiki vault path: reachable (${vaultPath})`);
    }
  } else {
    info.push('Wiki vault path: not configured');
  }

  return {
    timestamp: new Date().toISOString(),
    issues,
    info,
    hasIssues: issues.length > 0,
    fixableIssues: issues.filter((i) => i.fixable),
  };
}

/**
 * Apply fixes for issues found by runDoctorCheck.
 * Currently only handles legacy envelope contamination (batch delete).
 *
 * @param {object} params - { db, report }
 * @returns {object} Fix report
 */
export async function applyDoctorFixes(params) {
  const { db, report } = params;
  const changes = [];
  const warnings = [];
  const errors = [];

  for (const issue of report.issues) {
    if (!issue.fixable) {
      warnings.push(`Not fixable: ${issue.label}`);
      continue;
    }

    if (issue.id === 'legacy-envelope-contamination') {
      try {
        const table = await db.openTable(MEMORY_TABLE_NAME);
        const ids = issue.contaminatedIds;

        // Batch delete in chunks of 500
        for (let offset = 0; offset < ids.length; offset += LEGACY_ENVELOPE_DELETE_BATCH_SIZE) {
          const batch = ids.slice(offset, offset + LEGACY_ENVELOPE_DELETE_BATCH_SIZE);
          const predicate = buildInClause(batch);
          await table.delete(predicate);
        }

        // Verify deletion
        const remaining = await scanLegacyEnvelopeRowIds(table);
        if (remaining.length !== 0) {
          errors.push(`Legacy envelope cleanup verification failed: ${remaining.length} rows still contaminated`);
        } else {
          changes.push(`Deleted ${ids.length} memory ${ids.length === 1 ? 'row' : 'rows'} contaminated with legacy envelope metadata`);
        }
      } catch (err) {
        errors.push(`Failed to clean legacy envelope rows: ${err.message}`);
      }
    }
  }

  return { changes, warnings, errors };
}
