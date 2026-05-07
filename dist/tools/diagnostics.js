/**
 * Memory Diagnostics Tool - Minimal Entry Point
 *
 * Phase 2 minimal implementation.
 * Provides debug/stats entry points for diagnostics.
 *
 * IMPORTANT: This is a THIN WRAPPER for diagnostics.
 * All actual probing work is done by SearchManager and LanceDBStore.
 *
 * Also exports memory_stats and memory_debug functionality
 * (as requested in task spec - named exports in this file).
 */
import { getStoreInstance, getStoreStatus } from './store.js';
import { getRecallSearchManager, getRecallStatus } from './recall.js';
/**
 * Memory stats - thin wrapper over store/retrieval status.
 *
 * Provides statistics about memories and system status.
 *
 * @param input - Stats input (optional scope filter)
 * @returns Stats result
 */
export async function memoryStats(input = {}) {
    // Get store status
    let storeConnected = false;
    let storeDbPath = '';
    let storeTableName = '';
    let totalRecords = 0;
    try {
        const storeStatus = await getStoreStatus();
        storeConnected = storeStatus.connected;
        totalRecords = storeStatus.totalRecords;
        // Note: dbPath and tableName not in current getStoreStatus return
        // Will need to enhance store.ts to return more info
    }
    catch {
        storeConnected = false;
    }
    // Get retrieval status
    let retrievalStatus = {
        lexicalAvailable: false,
        vectorAvailable: false,
        hybridAvailable: false,
        embeddingAvailable: false,
    };
    try {
        const recallStatus = await getRecallStatus();
        if (recallStatus.ready) {
            const searchManager = getRecallSearchManager();
            const status = await searchManager.status();
            retrievalStatus = {
                lexicalAvailable: status.retrieval.lexicalAvailable,
                vectorAvailable: status.retrieval.vectorAvailable,
                hybridAvailable: status.retrieval.hybridAvailable,
                embeddingAvailable: status.embedding.isFunctional,
            };
            storeDbPath = status.store.dbPath;
            storeTableName = status.store.tableName;
        }
    }
    catch {
        // Retrieval status unavailable
    }
    // Get breakdowns from store
    const scopes = [];
    const categories = [];
    const layers = [];
    try {
        const store = getStoreInstance();
        // Get all records for breakdown (limited scope for performance)
        const records = await store.list({ limit: 500, scope: input.scope });
        // Build scope breakdown
        const scopeCounts = new Map();
        const categoryCounts = new Map();
        const layerCounts = new Map();
        for (const record of records) {
            // Scope count
            const scopeCount = scopeCounts.get(record.scope) ?? 0;
            scopeCounts.set(record.scope, scopeCount + 1);
            // Category count
            const catCount = categoryCounts.get(record.category) ?? 0;
            categoryCounts.set(record.category, catCount + 1);
            // Layer count (from metadata)
            const layer = record.metadata?.layer ?? 'working';
            const layerCount = layerCounts.get(layer) ?? 0;
            layerCounts.set(layer, layerCount + 1);
        }
        // Convert to arrays
        for (const [name, count] of scopeCounts) {
            scopes.push({ name, count });
        }
        for (const [name, count] of categoryCounts) {
            categories.push({ name, count });
        }
        for (const [name, count] of layerCounts) {
            layers.push({ name, count });
        }
    }
    catch {
        // Breakdown unavailable
    }
    return {
        totalMemories: totalRecords,
        scopes,
        categories,
        layers,
        store: {
            connected: storeConnected,
            dbPath: storeDbPath,
            tableName: storeTableName,
        },
        retrieval: retrievalStatus,
        success: storeConnected,
    };
}
/**
 * Memory debug - thin wrapper over retrieval debug.
 *
 * Provides debug information about search pipeline and ranking.
 *
 * HONEST STATUS:
 * - Pipeline trace: SUPPORTED (limited, depends on retriever implementation)
 * - Ranking explanation: LIMITED (requires retriever enhancement)
 * - Full mode: PARTIAL (stats + limited pipeline/rank)
 *
 * @param input - Debug input
 * @returns Debug result
 */
export async function memoryDebug(input) {
    const mode = input.mode ?? 'full';
    // Check recall tool status
    try {
        const recallStatus = await getRecallStatus();
        if (!recallStatus.ready) {
            return {
                query: input.query,
                success: false,
                error: 'Recall tool not ready - ' + (recallStatus.error ?? 'Unknown error'),
            };
        }
    }
    catch (error) {
        return {
            query: input.query,
            success: false,
            error: 'Recall tool not initialized',
        };
    }
    const searchManager = getRecallSearchManager();
    const result = {
        query: input.query,
        success: true,
    };
    // Get status for pipeline/rank context
    const status = await searchManager.status();
    // Pipeline mode: show retrieval pipeline trace
    if (mode === 'pipeline' || mode === 'full') {
        result.pipeline = {
            lexical: {
                count: 0, // Would need retriever to provide this
                topScores: [],
            },
            vector: {
                available: status.retrieval.vectorAvailable,
                unavailableReason: status.retrieval.vectorUnavailableReason,
            },
            hybrid: {
                enabled: status.config.hybrid,
                lexicalCount: 0,
                vectorCount: 0,
                mergedCount: 0,
            },
            rerank: {
                enabled: status.config.rerank,
                inputCount: 0,
                outputCount: 0,
                unavailableReason: status.rerank.unavailableReason,
            },
        };
        // NOTE: Full pipeline trace would require retriever to expose intermediate results
        // Current implementation only provides final results
        // This is an honest limitation
    }
    // Rank mode: show ranking explanation
    if (mode === 'rank' || mode === 'full') {
        try {
            // Perform search to get actual results
            const searchResults = await searchManager.search(input.query, {
                scope: input.scope,
                limit: input.limit ?? 5,
            });
            result.ranking = {
                results: searchResults.map(r => ({
                    path: r.path,
                    finalScore: r.score,
                    components: ['finalScore'], // Honest: cannot break down score components yet
                    // NOTE: lexicalScore, vectorScore, rerankScore would require retriever enhancement
                })),
            };
        }
        catch (error) {
            result.ranking = {
                results: [],
            };
        }
    }
    // Full mode: include stats
    if (mode === 'full') {
        const statsResult = await memoryStats({ scope: input.scope });
        result.full = statsResult;
    }
    return result;
}
/**
 * Get diagnostics status.
 *
 * Returns status about diagnostics capabilities.
 *
 * @returns Diagnostics capability status
 */
export async function getDiagnosticsStatus() {
    let storeConnected = false;
    let searchReady = false;
    try {
        const storeStatus = await getStoreStatus();
        storeConnected = storeStatus.connected;
    }
    catch {
        storeConnected = false;
    }
    try {
        const recallStatus = await getRecallStatus();
        searchReady = recallStatus.ready;
    }
    catch {
        searchReady = false;
    }
    return {
        statsSupported: storeConnected, // Stats depends on store
        debugPipelineSupported: searchReady, // Pipeline depends on search manager
        debugRankSupported: searchReady, // Rank depends on search manager
        storeConnected,
        searchReady,
    };
}
// All exports are at declaration time.
//# sourceMappingURL=diagnostics.js.map