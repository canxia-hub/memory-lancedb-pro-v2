/**
 * Memory Recall Tool - Thin Wrapper
 *
 * Phase 2 minimal implementation.
 * Wraps search-manager.search() for tool consumption.
 *
 * IMPORTANT: This is a THIN WRAPPER - does not reimplement retrieval logic.
 * All actual search work is done by SearchManager.
 */
import { createAndInitializeSearchManager, } from '../retrieval/search-manager.js';
import { resolveMemoryBackendConfig } from '../config/resolve-backend-config.js';
import { getStoreInstance } from './store.js'; // Import shared store instance
/**
 * Internal search manager instance.
 * Lazily initialized on first recall call.
 */
let _searchManager = null;
let _config = null;
let _backendConfig = null;
/**
 * Initialize recall tool with configuration.
 *
 * Must be called before using recall().
 * Typically called by plugin startup.
 *
 * @param config - Plugin configuration
 */
export async function initializeRecallTool(config, externalStore) {
    _config = config;
    _backendConfig = resolveMemoryBackendConfig(config);
    // CRITICAL FIX: Even with an external shared store, SearchManager.status()
    // still needs backendConfig for honest status reporting (dbPath/tableName/dimension).
    // Reuse the external store for data, but keep a real backendConfig instead of null.
    if (externalStore) {
        _searchManager = await createAndInitializeSearchManager(_config, _backendConfig, externalStore);
    }
    else {
        const sharedStore = getStoreInstance();
        _searchManager = await createAndInitializeSearchManager(_config, _backendConfig, sharedStore);
    }
}
/**
 * Close recall tool (cleanup).
 */
export async function closeRecallTool() {
    if (_searchManager) {
        await _searchManager.close();
        _searchManager = null;
    }
}
/**
 * Get search manager for direct consumption.
 *
 * Returns the internal SearchManager instance.
 * Throws if not initialized.
 *
 * @returns SearchManager instance
 */
export function getRecallSearchManager() {
    if (!_searchManager) {
        throw new Error('Recall tool not initialized - call initializeRecallTool() first');
    }
    return _searchManager;
}
/**
 * Memory recall - thin wrapper over search-manager.search().
 *
 * This is the primary recall tool entry point.
 * Maps RecallOptions to SearchOptions and calls SearchManager.search().
 *
 * IMPORTANT: Does NOT implement any retrieval logic itself.
 * All vector/BM25/hybrid/rerank work is done by SearchManager.
 *
 * @param options - Recall options
 * @returns Recall result with MemorySearchResult[]
 */
export async function memoryRecall(options) {
    if (!_searchManager) {
        return {
            results: [],
            total: 0,
            query: options.query,
            options,
            success: false,
            error: 'Recall tool not initialized - call initializeRecallTool() first',
        };
    }
    if (!options.query || options.query.trim() === '') {
        return {
            results: [],
            total: 0,
            query: '',
            options,
            success: true,
        };
    }
    try {
        // Map RecallOptions to SearchOptions (thin wrapper)
        const searchOptions = {
            query: options.query,
            scope: options.scope,
            category: options.category,
            limit: options.limit ?? 10,
            minScore: options.minScore ?? 0.1,
            mode: options.mode,
        };
        // Call SearchManager.search() - THIS IS THE CORE WORK
        const results = await _searchManager.search(options.query, searchOptions);
        // Return wrapped results
        return {
            results,
            total: results.length,
            query: options.query,
            options,
            success: true,
        };
    }
    catch (error) {
        return {
            results: [],
            total: 0,
            query: options.query,
            options,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown search error',
        };
    }
}
/**
 * Get recall tool status.
 *
 * Probes search manager status and availability.
 *
 * @returns Status information
 */
export async function getRecallStatus() {
    if (!_searchManager) {
        return {
            initialized: false,
            ready: false,
            error: 'Recall tool not initialized',
        };
    }
    try {
        const status = await _searchManager.status();
        return {
            initialized: true,
            ready: status.ready,
        };
    }
    catch (error) {
        return {
            initialized: true,
            ready: false,
            error: error instanceof Error ? error.message : 'Status probe failed',
        };
    }
}
// All exports are at declaration time.
//# sourceMappingURL=recall.js.map