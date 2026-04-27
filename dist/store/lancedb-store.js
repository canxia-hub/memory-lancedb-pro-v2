/**
 * LanceDB Store - Real Persistent Implementation
 *
 * Real LanceDB persistence with file-based storage.
 * Replaces Phase 1 in-memory fallback with true database operations.
 */
import { normalizeScope, DEFAULT_SCOPE } from './scope-manager.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
// LanceDB dynamic import
// Use createRequire for ESM compatibility with CommonJS modules
const require = createRequire(import.meta.url);
let lancedbModule = null;
async function loadLanceDB() {
    if (!lancedbModule) {
        // Use require() via createRequire for ESM compatibility
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
 * Real LanceDB persistence implementation.
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
        let db;
        try {
            db = await lancedb.connect(resolvedPath);
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
            // Table doesn't exist - create with schema row
            const schemaRow = {
                id: '__schema__',
                scope: 'global',
                content: '',
                embedding: Array.from({ length: config.embeddingDimension }).fill(0),
                category: 'other',
                importance: 0.7,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: '{}',
            };
            try {
                table = await db.createTable(config.tableName, [schemaRow]);
                await table.delete('id = "__schema__"');
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
        // Validate vector dimensions
        const sample = await table.query().limit(1).toArray();
        if (sample.length > 0 && sample[0]?.embedding?.length) {
            const existingDim = sample[0].embedding.length;
            if (existingDim !== config.embeddingDimension) {
                throw new Error(`Vector dimension mismatch: table=${existingDim}, config=${config.embeddingDimension}. Create a new table/dbPath or set matching embedding.dimensions.`);
            }
        }
        _db = db;
        _table = table;
        _connected = true;
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
                embedding: Array.from({ length: config.embeddingDimension }).fill(0),
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
            let query = _table.query().where(`id = '${safeId}'`).limit(1);
            if (scope) {
                const resolvedScope = resolveScope(scope);
                query = query.where(`scope = '${escapeSqlLiteral(resolvedScope)}'`);
            }
            const rows = await query.toArray();
            if (rows.length === 0)
                return null;
            return mapRowToRecord(rows[0]);
        },
        async update(id, updates, scope) {
            await ensureInitialized();
            return runSerializedUpdate(async () => {
                // Get existing record
                const safeId = escapeSqlLiteral(id);
                let query = _table.query().where(`id = '${safeId}'`).limit(1);
                if (scope) {
                    const resolvedScope = resolveScope(scope);
                    query = query.where(`scope = '${escapeSqlLiteral(resolvedScope)}'`);
                }
                const rows = await query.toArray();
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
                // LanceDB doesn't support in-place update, use delete+add
                // Best-effort rollback on failure
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
                return mapRowToRecord(updatedRow);
            });
        },
        async delete(id, scope) {
            await ensureInitialized();
            const safeId = escapeSqlLiteral(id);
            // Note: Don't use select() to avoid LanceDB column name case issues
            let query = _table.query().where(`id = '${safeId}'`).limit(1);
            if (scope) {
                const resolvedScope = resolveScope(scope);
                query = query.where(`scope = '${escapeSqlLiteral(resolvedScope)}'`);
            }
            const rows = await query.toArray();
            if (rows.length === 0)
                return false;
            await _table.delete(`id = '${safeId}'`);
            return true;
        },
        async list(options) {
            await ensureInitialized();
            let query = _table.query();
            // Build where conditions
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
            // Note: Don't use select() to avoid LanceDB column name case issues
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
                // Get total count
                // Note: Don't use select() to avoid LanceDB column name case issues
                const results = await _table.query().toArray();
                const totalRecords = results.length;
                return {
                    connected: _connected,
                    dbPath: config.dbPath,
                    tableName: config.tableName,
                    totalRecords,
                    connectionMode: config.connectionMode,
                    hasVectors: vectorAvailability.hasPopulatedVectors,
                    embeddingDimension: vectorAvailability.dimension,
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
    };
    return store;
}
//# sourceMappingURL=lancedb-store.js.map