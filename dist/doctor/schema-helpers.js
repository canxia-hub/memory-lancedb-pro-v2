/**
 * Doctor Schema Helpers
 *
 * Ported from official lancedb-schema.ts with v3→v4 adaptations.
 * Provides SQL escaping, table/column constants, and schema validation utilities.
 */

export const MEMORY_TABLE_NAME = 'memories';
export const ASSETS_TABLE_NAME = 'memory_assets';

// v3→v4 expected columns (our schema, not agentId-based)
export const REQUIRED_COLUMNS = [
  'id',
  'scope',
  'content',
  'embedding',
  'category',
  'importance',
  'createdAt',
  'updatedAt',
  'metadata',
];

export const REQUIRED_ASSET_COLUMNS = [
  'id',
  'memory_id',
  'modality',
  'mime_type',
  'storage_path',
  'created_at',
];

/**
 * Escape a string for safe use as a LanceDB SQL literal.
 * Single quotes are doubled.
 */
export function quoteLanceSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * Build a SQL predicate for a list of IDs (for batch delete).
 * Returns: 'id IN ('uuid1', 'uuid2', ...)
 */
export function buildInClause(ids) {
  const quoted = ids.map((id) => quoteLanceSqlString(id));
  return `id IN (${quoted.join(', ')})`;
}

/**
 * Check if the memories table schema has all required columns.
 * Returns { missing: string[], extra: string[] }
 */
export function validateMemorySchema(schemaFields) {
  const fieldNames = schemaFields.map((f) => f.name);
  const missing = REQUIRED_COLUMNS.filter((col) => !fieldNames.includes(col));
  const extra = fieldNames.filter((col) => !REQUIRED_COLUMNS.includes(col));
  return { missing, extra };
}

/**
 * Check if the assets table schema has all required columns.
 */
export function validateAssetsSchema(schemaFields) {
  const fieldNames = schemaFields.map((f) => f.name);
  const missing = REQUIRED_ASSET_COLUMNS.filter((col) => !fieldNames.includes(col));
  const extra = fieldNames.filter((col) => !REQUIRED_ASSET_COLUMNS.includes(col));
  return { missing, extra };
}

/**
 * Check if the embedding column has the expected FixedSizeList type
 * with the correct dimension.
 */
export function validateEmbeddingDimension(schemaFields, expectedDimension) {
  const embField = schemaFields.find((f) => f.name === 'embedding');
  if (!embField) {
    return { valid: false, reason: 'embedding column missing' };
  }
  const typeName = String(embField.type ?? '');
  // FixedSizeList[2560]<Float32> — extract dimension from type string
  const match = typeName.match(/FixedSizeList\[(\d+)\]/);
  if (match) {
    const dim = parseInt(match[1], 10);
    if (dim === expectedDimension) {
      return { valid: true, dimension: dim };
    }
    return { valid: false, reason: `dimension mismatch: expected ${expectedDimension}, got ${dim}`, dimension: dim };
  }
  // Legacy variable-length List
  if (/^List</.test(typeName)) {
    return { valid: false, reason: `legacy variable-length vector column (${typeName}), run migrate-v4-vector-schema.mjs` };
  }
  return { valid: false, reason: `unexpected embedding type: ${typeName}` };
}

/**
 * Check if FTS index exists on the content column.
 */
export function hasFtsIndex(indices) {
  return indices.some(
    (idx) =>
      idx.indexType === 'FTS' ||
      (idx.columns && idx.columns.includes('content'))
  );
}

/**
 * Check if a wiki vault path is reachable.
 */
export function checkWikiVaultPath(vaultPath) {
  if (!vaultPath) {
    return { reachable: false, reason: 'vault path not configured' };
  }
  try {
    const fs = require('node:fs');
    if (fs.existsSync(vaultPath)) {
      const stat = fs.statSync(vaultPath);
      if (stat.isDirectory()) {
        return { reachable: true, path: vaultPath };
      }
      return { reachable: false, reason: 'vault path is not a directory' };
    }
    return { reachable: false, reason: 'vault path does not exist' };
  } catch (err) {
    return { reachable: false, reason: err.message };
  }
}
