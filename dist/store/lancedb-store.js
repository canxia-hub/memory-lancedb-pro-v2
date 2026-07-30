/**
 * LanceDB Store - Real Persistent Implementation
 *
 * Real LanceDB persistence with file-based storage.
 * Upgraded to @lancedb/lancedb 0.33.0 with:
 * - readConsistencyInterval for cross-process visibility
 * - mergeInsert for atomic upsert (replaces delete+add)
 * - FTS full-text search index on content column
 * - cosine native vector search via distanceType
 * - BITMAP scalar indexes on scope/category columns
 */
import { normalizeScope, DEFAULT_SCOPE } from './scope-manager.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { embedMultimodal } from '../retrieval/embedder.js';
import { Field, FixedSizeList, Float32, Float64, Schema, Utf8 } from 'apache-arrow';

// 0.33: memories 表必须使用 FixedSizeList<Float32> 向量列，否则 vectorSearch 不可用
//（0.4 时代 schemaRow 推断出的 List<Float64> 在 0.33 下不被识别为向量列）
function makeMemoriesSchema(dim) {
    return new Schema([
        new Field('id', new Utf8(), false),
        new Field('scope', new Utf8(), false),
        new Field('content', new Utf8(), false),
        new Field('embedding', new FixedSizeList(dim, new Field('item', new Float32(), true)), true),
        new Field('category', new Utf8(), false),
        new Field('importance', new Float64(), false),
        new Field('createdAt', new Utf8(), false),
        new Field('updatedAt', new Utf8(), false),
        new Field('metadata', new Utf8(), false),
    ]);
}

// 检测 0.4 遗留的可变长 List 向量列（0.33 下 vectorSearch 不可用，需跑迁移脚本）
function isLegacyVectorSchema(field) {
    if (!field) return false;
    const typeName = String(field.type ?? '');
    return /^List</.test(typeName) && !/FixedSizeList/.test(typeName);
}
// LanceDB dynamic import
// Use createRequire for ESM compatibility with CommonJS modules
const require = createRequire(import.meta.url);
let lancedbModule = null;
async function loadLanceDB() {
    if (!lancedbModule) {
        // Exclude network section from process.report to avoid slow reverse-DNS
        // lookups on first LanceDB load (can block event loop 100-250s on some hosts)
        try {
            process.report.excludeNetwork = true;
        } catch { /* Node < 22 without the flag */ }
        lancedbModule = require('@lancedb/lancedb');
    }
    return lancedbModule;
}
// Escape SQL literal for safe queries
function escapeSqlLiteral(value) {
    return value.replace(/'/g, "''");
}
// Validate and prepare storage path
function validateStoragePath(dbPath) {
    let resolvedPath = dbPath;
    // Resolve symlinks
    try {
        const stats = lstatSync(dbPath);
        if (stats.isSymbolicLink()) {
            try {
                resolvedPath = realpathSync(dbPath);
            }
            catch (err) {
                throw new Error(`dbPath "${dbPath}" is a symlink whose target does not exist. Details: ${err.message}`);
            }
        }
    }
    catch (err) {
        if (err?.code === 'ENOENT') {
            // Missing path is OK, will be created
        }
        else if (err.message.includes('symlink whose target')) {
            throw err;
        }
    }
    // Create directory if missing
    if (!existsSync(resolvedPath)) {
        try {
            mkdirSync(resolvedPath, { recursive: true });
        }
        catch (err) {
            throw new Error(`Failed to create dbPath directory "${resolvedPath}". Details: ${err.message}`);
        }
    }
    // Check write permissions
    try {
        accessSync(resolvedPath, constants.W_OK);
    }
    catch (err) {
        throw new Error(`dbPath directory "${resolvedPath}" is not writable. Details: ${err.message}`);
    }
    return resolvedPath;
}

/**
 * Create LanceDB store instance.
 *
 * Real LanceDB persistence implementation with 0.33.0 features.
 *
 * @param config - Backend configuration
 * @returns Store instance
 */
export function createLanceDBStore(config) {
    // Internal state
    let _connected = false;
    let _db = null; // LanceDB Connection
    let _table = null; // LanceDB Table
    let _initPromise = null;
    let _updateQueue = Promise.resolve(); // Serialize updates
    let _ftsIndexCreated = false; // Track FTS index state
    let _lastFtsError = null; // Last FTS error for diagnostics

    // Generate UUID
    function generateId() {
        return randomUUID();
    }
    // Get current ISO timestamp
    function timestamp() {
        return new Date().toISOString();
    }
    // Normalize scope
    function resolveScope(scope) {
        return normalizeScope(scope, config.tableName === 'memories' ? DEFAULT_SCOPE : undefined);
    }

    // Check if FTS is enabled in config
    function isFtsEnabled() {
        // Default: enabled for memories table, can be disabled via retrieval.fts: false
        return config.retrieval?.fts !== false;
    }

    // Ensure initialization (singleton pattern)
    async function ensureInitialized() {
        if (_table)
            return;
        if (_initPromise)
            return _initPromise;
        _initPromise = doInitialize().catch((err) => {
            _initPromise = null;
            throw err;
        });
        return _initPromise;
    }

    // Real LanceDB initialization
    async function doInitialize() {
        const lancedb = await loadLanceDB();
        const resolvedPath = validateStoragePath(config.dbPath);

        // 0.33: connect with readConsistencyInterval for cross-process visibility
        const readConsistencyInterval = config.readConsistencyIntervalSeconds ?? 5;
        let db;
        try {
            db = await lancedb.connect(resolvedPath, {
                readConsistencyInterval,
            });
        }
        catch (err) {
            throw new Error(`Failed to open LanceDB at "${resolvedPath}": ${err.code || ''} ${err.message}`);
        }

        let table;
        // Try to open existing table, create if missing
        try {
            table = await db.openTable(config.tableName);
        }
        catch (_openErr) {
            // Table doesn't exist - create with proper FixedSizeList<Float32> vector schema (0.33)
            try {
                table = await db.createEmptyTable(config.tableName, makeMemoriesSchema(config.embeddingDimension), { existOk: true });
            }
            catch (createErr) {
                // Race condition: another process created the table
                if (String(createErr).includes('already exists')) {
                    table = await db.openTable(config.tableName);
                }
                else {
                    throw createErr;
                }
            }
        }

        // 0.4 遗留 schema 检测：可变长 List 向量列在 0.33 下 vectorSearch 不可用
        // → 提示跑 scripts/migrate-v4-vector-schema.mjs；检索层会回退 JS cosine
        try {
            const _schemaNow = await table.schema();
            const _embField = _schemaNow.fields.find((f) => f.name === 'embedding');
            if (isLegacyVectorSchema(_embField)) {
                console.warn('[memory-lancedb-pro] legacy variable-length vector column detected (0.4 schema). ' +
                    'Native vectorSearch is unavailable until you run scripts/migrate-v4-vector-schema.mjs. ' +
                    'Falling back to JS cosine retrieval.');
            }
        }
        catch { /* schema probe best-effort */ }

        // Validate vector dimensions
        const sample = await table.query().limit(1).toArray();
        if (sample.length > 0 && sample[0]?.embedding?.length) {
            const existingDim = sample[0].embedding.length;
            if (existingDim !== config.embeddingDimension) {
                throw new Error(`Vector dimension mismatch: table=${existingDim}, config=${config.embeddingDimension}. Create a new table/dbPath or set matching embedding.dimensions.`);
            }
        }

        // Create scalar indexes (BITMAP) on scope and category columns
        // These are low-cardinality columns ideal for BITMAP indexes
        await createScalarIndexes(lancedb, table);

        // Create FTS index on content column (graceful fallback if unavailable)
        if (isFtsEnabled() && config.tableName === 'memories') {
            await createFtsIndex(lancedb, table);
        }

        _db = db;
        _table = table;
        _connected = true;
    }

    // Create BITMAP indexes on scope and category columns
    async function createScalarIndexes(lancedb, table) {
        try {
            const indices = await table.listIndices();
            const existingColumns = new Set();
            for (const idx of indices) {
                if (idx.columns) {
                    for (const col of idx.columns) existingColumns.add(col);
                }
            }

            // BITMAP on scope (low cardinality)
            if (!existingColumns.has('scope')) {
                try {
                    await table.createIndex('scope', { config: lancedb.Index.bitmap() });
                } catch (e) {
                    // May fail if data is too small or column type incompatible; non-critical
                    console.warn(`[memory-lancedb-pro] BITMAP index on 'scope' skipped: ${e.message?.slice(0, 100)}`);
                }
            }

            // BITMAP on category (low cardinality)
            if (!existingColumns.has('category')) {
                try {
                    await table.createIndex('category', { config: lancedb.Index.bitmap() });
                } catch (e) {
                    console.warn(`[memory-lancedb-pro] BITMAP index on 'category' skipped: ${e.message?.slice(0, 100)}`);
                }
            }
        } catch (e) {
            // listIndices may fail on very old tables; non-critical
            console.warn(`[memory-lancedb-pro] Scalar index setup skipped: ${e.message?.slice(0, 100)}`);
        }
    }

    // Create FTS index on content column with graceful fallback
    async function createFtsIndex(lancedb, table) {
        try {
            const indices = await table.listIndices();
            // Check if FTS index already exists on content column
            const hasFts = indices.some(idx =>
                idx.indexType === 'FTS' ||
                (idx.columns && idx.columns.includes('content'))
            );
            if (!hasFts) {
                await table.createIndex('content', {
                    config: lancedb.Index.fts({
                        withPosition: true,
                        // 中英分词：0.33 内置 icu tokenizer（CJK 切分 + 英文），无需外部语言模型
                        //（jieba 需外部模型目录，本机不可用；simple 无法切分 CJK）
                        baseTokenizer: 'icu',
                        lowercase: true,
                        stem: false,
                        removeStopWords: false,
                        asciiFolding: false,
                    }),
                });
            }
            _ftsIndexCreated = true;
            _lastFtsError = null;
        } catch (err) {
            _ftsIndexCreated = false;
            _lastFtsError = err instanceof Error ? err.message : String(err);
            console.warn(`[memory-lancedb-pro] FTS index creation failed, falling back to vector-only search: ${_lastFtsError?.slice(0, 150)}`);
        }
    }

    // Serialize updates to avoid delete+add race
    async function runSerializedUpdate(action) {
        const previous = _updateQueue;
        let release;
        const lock = new Promise((resolve) => {
            release = resolve;
        });
        _updateQueue = previous.then(() => lock);
        await previous;
        try {
            return await action();
        }
        finally {
            release?.();
        }
    }

    // Probe vector availability (real implementation)
    async function probeVectors() {
        if (!_table) {
            return {
                hasVectorColumn: false,
                hasPopulatedVectors: false,
                unavailableReason: 'Store not initialized',
            };
        }
        try {
            const schema = await _table.schema();
            const fields = schema.fields.map((f) => f.name);
            const hasVectorColumn = fields.includes('embedding');
            if (!hasVectorColumn) {
                return {
                    hasVectorColumn: false,
                    hasPopulatedVectors: false,
                    unavailableReason: 'Table schema missing embedding column',
                };
            }
            // Check if any records have non-zero vectors
            const results = await _table.query().limit(100).toArray();
            const withVectors = results.filter((r) => r.embedding && r.embedding.length > 0);
            const dimension = withVectors.length > 0 ? withVectors[0].embedding.length : config.embeddingDimension;
            const percentage = results.length > 0 ? (withVectors.length / results.length) * 100 : 0;
            return {
                hasVectorColumn,
                hasPopulatedVectors: withVectors.length > 0,
                dimension,
                populationPercentage: percentage,
                unavailableReason: withVectors.length === 0 ? 'No records with embeddings yet' : undefined,
            };
        }
        catch (err) {
            return {
                hasVectorColumn: false,
                hasPopulatedVectors: false,
                unavailableReason: `Schema probe failed: ${err.message}`,
            };
        }
    }

    // Map raw row to MemoryRecord
    function mapRowToRecord(row) {
        const embedding = row.embedding ? Array.from(row.embedding) : null;
        let metadata = {};
        try {
            if (row.metadata && typeof row.metadata === 'string') {
                metadata = JSON.parse(row.metadata);
            }
            else if (row.metadata && typeof row.metadata === 'object') {
                metadata = row.metadata;
            }
        }
        catch (_e) {
            metadata = {};
        }
        return {
            id: row.id,
            scope: row.scope ?? 'global',
            content: row.content,
            embedding,
            category: row.category,
            importance: Number(row.importance) ?? 0.7,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            metadata,
        };
    }

    // Store implementation
    const store = {
        async initialize() {
            await ensureInitialized();
        },
        async close() {
            _connected = false;
            _db = null;
            _table = null;
            _initPromise = null;
            _ftsIndexCreated = false;
        },
        async create(input) {
            await ensureInitialized();
            const id = generateId();
            const scope = resolveScope(input.scope);
            const now = timestamp();
            const metadataStr = JSON.stringify(input.metadata ?? {});
            const row = {
                id,
                scope,
                content: input.content,
                embedding: input.embedding ?? (config.embedding ? (await embedMultimodal({ text: input.content }, { ...config.embedding, dimension: config.embeddingDimension })).embedding : Array.from({ length: config.embeddingDimension }).fill(0)),
                category: input.category ?? 'other',
                importance: input.importance ?? 0.7,
                createdAt: now,
                updatedAt: now,
                metadata: metadataStr,
            };
            try {
                await _table.add([row]);
            }
            catch (err) {
                throw new Error(`Failed to create memory in "${config.dbPath}": ${err.message}`);
            }
            return mapRowToRecord(row);
        },
        async get(id, scope) {
            await ensureInitialized();
            const safeId = escapeSqlLiteral(id);
            // 0.30+: multiple where() calls are AND-combined (correct behavior)
            // Build a single combined predicate for clarity and correctness
            let predicate = `id = '${safeId}'`;
            if (scope) {
                const resolvedScope = resolveScope(scope);
                predicate += ` AND scope = '${escapeSqlLiteral(resolvedScope)}'`;
            }
            const rows = await _table.query().where(predicate).limit(1).toArray();
            if (rows.length === 0)
                return null;
            return mapRowToRecord(rows[0]);
        },
        async update(id, updates, scope) {
            await ensureInitialized();
            return runSerializedUpdate(async () => {
                // Get existing record
                const safeId = escapeSqlLiteral(id);
                let predicate = `id = '${safeId}'`;
                if (scope) {
                    const resolvedScope = resolveScope(scope);
                    predicate += ` AND scope = '${escapeSqlLiteral(resolvedScope)}'`;
                }
                const rows = await _table.query().where(predicate).limit(1).toArray();
                if (rows.length === 0)
                    return null;
                const existing = mapRowToRecord(rows[0]);
                const now = timestamp();
                // Build updated row
                const updatedRow = {
                    id: existing.id,
                    scope: updates.scope ? resolveScope(updates.scope) : existing.scope,
                    content: updates.content ?? existing.content,
                    embedding: existing.embedding ?? Array.from({ length: config.embeddingDimension }).fill(0),
                    category: updates.category ?? existing.category,
                    importance: updates.importance ?? existing.importance,
                    createdAt: existing.createdAt, // Preserve original createdAt
                    updatedAt: now,
                    metadata: JSON.stringify(updates.metadata ?? existing.metadata),
                };
                // 0.33: Use mergeInsert for atomic upsert (replaces delete+add)
                // mergeInsert on 'id' key: when matched → update all, when not matched → insert
                try {
                    const mergeResult = await _table
                        .mergeInsert('id')
                        .whenMatchedUpdateAll()
                        .whenNotMatchedInsertAll()
                        .execute([updatedRow]);
                    // Verify the update was applied
                    if (mergeResult.numUpdatedRows === 0 && mergeResult.numInsertedRows > 0) {
                        // This shouldn't happen since we verified the row exists above,
                        // but handle gracefully
                        console.warn(`[memory-lancedb-pro] mergeInsert inserted instead of updated for id=${id}`);
                    }
                }
                catch (mergeErr) {
                    // Fallback to delete+add if mergeInsert fails (e.g. on old tables without primary key)
                    console.warn(`[memory-lancedb-pro] mergeInsert failed, falling back to delete+add: ${mergeErr.message?.slice(0, 100)}`);
                    try {
                        await _table.delete(`id = '${safeId}'`);
                        await _table.add([updatedRow]);
                    }
                    catch (addError) {
                        // Attempt rollback
                        try {
                            await _table.add([mapRowToRecord(rows[0])]);
                        }
                        catch (rollbackError) {
                            throw new Error(`Update failed for ${id}: write failed after delete, and rollback also failed. ` +
                                `Error: ${addError instanceof Error ? addError.message : String(addError)}`);
                        }
                        throw new Error(`Update failed for ${id}: write failed after delete, original restored. ` +
                            `Error: ${addError instanceof Error ? addError.message : String(addError)}`);
                    }
                }
                return mapRowToRecord(updatedRow);
            });
        },
        async delete(id, scope) {
            await ensureInitialized();
            const safeId = escapeSqlLiteral(id);
            // Build combined predicate for AND semantics
            let predicate = `id = '${safeId}'`;
            if (scope) {
                const resolvedScope = resolveScope(scope);
                predicate += ` AND scope = '${escapeSqlLiteral(resolvedScope)}'`;
            }
            // Use countRows with predicate to check existence efficiently
            try {
                const count = await _table.countRows(predicate);
                if (count === 0) return false;
            } catch (e) {
                // Fallback: query-based check
                const rows = await _table.query().where(predicate).limit(1).toArray();
                if (rows.length === 0) return false;
            }
            await _table.delete(predicate);
            return true;
        },
        async list(options) {
            await ensureInitialized();
            let query = _table.query();
            // Build where conditions as single combined predicate
            const conditions = [];
            if (options?.scope) {
                const resolvedScope = resolveScope(options.scope);
                conditions.push(`scope = '${escapeSqlLiteral(resolvedScope)}'`);
            }
            if (options?.category) {
                conditions.push(`category = '${escapeSqlLiteral(options.category)}'`);
            }
            if (conditions.length > 0) {
                query = query.where(conditions.join(' AND '));
            }
            // Fetch all matching rows for correct app-layer sorting
            const results = await query.toArray();
            // Map to MemoryRecord
            const records = results.map(mapRowToRecord);
            // Apply ordering
            const orderBy = options?.orderBy ?? 'createdAt';
            const direction = options?.orderDirection ?? 'desc';
            records.sort((a, b) => {
                const aVal = orderBy === 'importance' ? a.importance :
                    orderBy === 'updatedAt' ? new Date(a.updatedAt).getTime() :
                        new Date(a.createdAt).getTime();
                const bVal = orderBy === 'importance' ? b.importance :
                    orderBy === 'updatedAt' ? new Date(b.updatedAt).getTime() :
                        new Date(b.createdAt).getTime();
                return direction === 'asc' ? aVal - bVal : bVal - aVal;
            });
            // Apply pagination
            const offset = options?.offset ?? 0;
            const limit = options?.limit ?? 50;
            return records.slice(offset, offset + limit);
        },
        async status() {
            if (!_table) {
                return {
                    connected: false,
                    dbPath: config.dbPath,
                    tableName: config.tableName,
                    totalRecords: 0,
                    connectionMode: config.connectionMode,
                    hasVectors: false,
                };
            }
            try {
                const vectorAvailability = await probeVectors();
                // Re-check _table after async gap (race condition: close() may
                // have been called while probeVectors() was awaited)
                if (!_table) {
                    return {
                        connected: false,
                        dbPath: config.dbPath,
                        tableName: config.tableName,
                        totalRecords: 0,
                        connectionMode: config.connectionMode,
                        hasVectors: false,
                    };
                }
                // Use countRows() for efficient total count (0.33 API)
                let totalRecords;
                try {
                    totalRecords = await _table.countRows();
                } catch (e) {
                    // Fallback for edge cases
                    const results = await _table.query().toArray();
                    totalRecords = results.length;
                }
                return {
                    connected: _connected,
                    dbPath: config.dbPath,
                    tableName: config.tableName,
                    totalRecords,
                    connectionMode: config.connectionMode,
                    hasVectors: vectorAvailability.hasPopulatedVectors,
                    embeddingDimension: vectorAvailability.dimension,
                    ftsAvailable: _ftsIndexCreated,
                    ftsError: _lastFtsError,
                };
            }
            catch (err) {
                // Defensive: return safe fallback on any error (e.g. _table nullified mid-flight)
                return {
                    connected: false,
                    dbPath: config.dbPath,
                    tableName: config.tableName,
                    totalRecords: 0,
                    connectionMode: config.connectionMode,
                    hasVectors: false,
                };
            }
        },
        async probeVectorAvailability() {
            return probeVectors();
        },
        // Expose FTS state for retrieval layer
        get ftsIndexCreated() { return _ftsIndexCreated; },
        get lastFtsError() { return _lastFtsError; },
        // Expose table reference for retrieval layer (FTS search)
        get table() { return _table; },
    };
    return store;
}
//# sourceMappingURL=lancedb-store.js.map
