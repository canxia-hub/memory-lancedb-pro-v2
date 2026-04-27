/**
 * Memory Store Tool - Thin Wrapper
 *
 * Phase 2 minimal implementation.
 * Wraps LanceDBStore create/list for tool consumption.
 *
 * IMPORTANT: This is a THIN WRAPPER - does not reimplement storage logic.
 * All actual storage work is done by LanceDBStore.
 *
 * Also exports memory_list functionality (as requested in task spec).
 */
import { createLanceDBStore, } from '../store/lancedb-store.js';
import { resolveMemoryBackendConfig } from '../config/resolve-backend-config.js';
import { normalizeScope, DEFAULT_SCOPE } from '../store/scope-manager.js';
import { getAssetStore, } from '../store/asset-store.js';
/**
 * Internal store instance.
 * Lazily initialized.
 */
let _store = null;
let _config = null;
let _backendConfig = null;
/**
 * Initialize store tool with configuration.
 *
 * Must be called before using store/list functions.
 *
 * @param config - Plugin configuration
 * @param externalStore - Optional external store instance to reuse
 */
export async function initializeStoreTool(config, externalStore) {
    _config = config;
    // CRITICAL FIX: If external store provided, use it directly without resolving backend config
    if (externalStore) {
        _store = externalStore;
        _backendConfig = null; // Not needed when using external store
    }
    else {
        _backendConfig = resolveMemoryBackendConfig(config);
        _store = createLanceDBStore(_backendConfig);
        await _store.initialize();
    }
}
/**
 * Close store tool (cleanup).
 */
export async function closeStoreTool() {
    if (_store) {
        await _store.close();
        _store = null;
    }
}
/**
 * Get store instance for direct consumption.
 *
 * @returns LanceDBStore instance
 */
export function getStoreInstance() {
    if (!_store) {
        throw new Error('Store tool not initialized - call initializeStoreTool() first');
    }
    return _store;
}
/**
 * Build memory path from scope and id.
 *
 * @param scope - Memory scope
 * @param id - Memory ID
 * @returns Memory path (memory://<scope>/<id>)
 */
function buildMemoryPath(scope, id) {
    return `memory://${scope}/${id}`;
}
/**
 * Truncate content for display.
 *
 * @param content - Full content
 * @param maxChars - Max characters (default: 180)
 * @returns Truncated summary
 */
function truncateForDisplay(content, maxChars = 180) {
    if (content.length <= maxChars) {
        return content;
    }
    return content.substring(0, maxChars) + '...';
}
/**
 * Memory store - thin wrapper over LanceDBStore.create().
 *
 * Creates a new memory record.
 * Extended (Phase C) to handle multimodal assets.
 *
 * IMPORTANT: Does NOT implement storage logic itself.
 * All storage work is done by LanceDBStore + AssetStore.
 *
 * Behavior:
 * 1. Create main memory record
 * 2. If assets provided: create asset index records
 * 3. Return combined result
 *
 * @param input - Memory store input
 * @returns Store result with created record and asset info
 */
export async function memoryStore(input) {
    const emptyRecord = {
        id: '',
        scope: '',
        content: '',
        category: '',
        importance: 0,
        createdAt: '',
    };
    if (!_store) {
        return {
            record: emptyRecord,
            path: '',
            success: false,
            error: 'Store tool not initialized - call initializeStoreTool() first',
        };
    }
    if (!input.text || input.text.trim() === '') {
        return {
            record: emptyRecord,
            path: '',
            success: false,
            error: 'Memory content is required',
        };
    }
    try {
        // Map MemoryStoreInput to MemoryRecordInput (thin wrapper)
        // Include sourceType and sourceRef in metadata (Phase C)
        const enrichedMetadata = {
            ...input.metadata,
            ...(input.sourceType && { sourceType: input.sourceType }),
            ...(input.sourceRef && { sourceRef: input.sourceRef }),
        };
        const recordInput = {
            content: input.text,
            scope: input.scope,
            category: input.category ?? 'other',
            importance: input.importance ?? 0.7,
            metadata: enrichedMetadata,
        };
        // Call LanceDBStore.create() - THIS IS THE CORE WORK
        const record = await _store.create(recordInput);
        // Build memory path
        const path = buildMemoryPath(record.scope, record.id);
        // Phase C: Handle assets if provided
        let assetResult = undefined;
        if (input.assets && input.assets.length > 0) {
            try {
                // Get asset store (may not be initialized if not enabled)
                const assetStore = getAssetStore();
                const batchResult = await assetStore.batchCreate(record.id, input.assets);
                assetResult = {
                    records: batchResult.assets,
                    successCount: batchResult.successCount,
                    failCount: batchResult.failCount,
                    errors: batchResult.errors,
                };
            }
            catch (assetError) {
                // Asset store not initialized or write failed
                // Return partial success - memory created but assets failed
                return {
                    record: {
                        id: record.id,
                        scope: record.scope,
                        content: truncateForDisplay(record.content),
                        category: record.category,
                        importance: record.importance,
                        createdAt: record.createdAt,
                        sourceType: input.sourceType,
                        sourceRef: input.sourceRef,
                    },
                    path,
                    success: true,
                    error: `Memory created but assets failed: ${assetError instanceof Error ? assetError.message : 'Unknown asset error'}`,
                };
            }
        }
        // Return display-friendly result
        return {
            record: {
                id: record.id,
                scope: record.scope,
                content: truncateForDisplay(record.content),
                category: record.category,
                importance: record.importance,
                createdAt: record.createdAt,
                sourceType: input.sourceType,
                sourceRef: input.sourceRef,
            },
            path,
            success: true,
            ...(assetResult && { assets: assetResult }),
        };
    }
    catch (error) {
        return {
            record: emptyRecord,
            path: '',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown store error',
        };
    }
}
/**
 * Memory list - thin wrapper over LanceDBStore.list().
 *
 * Lists memory records with filters and pagination.
 *
 * IMPORTANT: Does NOT implement filtering logic itself.
 * All query work is done by LanceDBStore.
 *
 * @param options - List options
 * @returns List result with memory items
 */
export async function memoryList(options = {}) {
    if (!_store) {
        return {
            memories: [],
            total: 0,
            hasMore: false,
            options,
            success: false,
            error: 'Store tool not initialized - call initializeStoreTool() first',
        };
    }
    try {
        // Map MemoryListOptions to StoreQueryOptions (thin wrapper)
        const queryOptions = {
            scope: options.scope !== undefined ? normalizeScope(options.scope, _config?.defaultScope ?? DEFAULT_SCOPE) : undefined,
            category: options.category,
            limit: Math.min(options.limit ?? 10, 50),
            offset: options.offset ?? 0,
            orderBy: options.orderBy ?? 'createdAt',
            orderDirection: options.orderDirection ?? 'desc',
        };
        // Call LanceDBStore.list() - THIS IS THE CORE WORK
        const records = await _store.list(queryOptions);
        // Map to display-friendly MemoryListItem
        const memories = records.map(record => ({
            memoryId: record.id,
            scope: record.scope,
            path: buildMemoryPath(record.scope, record.id),
            summary: truncateForDisplay(record.content),
            category: record.category,
            importance: record.importance,
            createdAt: record.createdAt,
        }));
        // Determine if more items exist (approximate)
        const hasMore = records.length === queryOptions.limit;
        return {
            memories,
            total: memories.length,
            hasMore,
            options,
            success: true,
        };
    }
    catch (error) {
        return {
            memories: [],
            total: 0,
            hasMore: false,
            options,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown list error',
        };
    }
}
/**
 * Get store status.
 *
 * Probes store connection and stats.
 *
 * @returns Status information
 */
export async function getStoreStatus() {
    if (!_store) {
        return {
            initialized: false,
            connected: false,
            totalRecords: 0,
            error: 'Store tool not initialized',
        };
    }
    try {
        const status = await _store.status();
        return {
            initialized: true,
            connected: status.connected,
            totalRecords: status.totalRecords,
        };
    }
    catch (error) {
        return {
            initialized: true,
            connected: false,
            totalRecords: 0,
            error: error instanceof Error ? error.message : 'Status probe failed',
        };
    }
}
// All exports are at declaration time.
//# sourceMappingURL=store.js.map