/**
 * Search Manager - Public Search Interface
 *
 * Phase 1 skeleton implements:
 * - status() - store/retrieval availability
 * - search(query, options) - public search returning MemorySearchResult[]
 * - probeEmbeddingAvailability() - embedding status
 * - probeVectorAvailability() - vector search status
 *
 * IMPORTANT: Must use frozen MemorySearchResult type from types/memory-search-result.ts.
 * Must NOT redefine public shared-search shape.
 */
import { createLanceDBStore } from '../store/lancedb-store.js';
import { normalizeScope, DEFAULT_SCOPE } from '../store/scope-manager.js';
import { createHybridRetriever } from './hybrid-retriever.js';
import { createDefaultRerankManager } from './rerank.js';
import { buildEmbeddingAvailability as buildDashScopeEmbeddingAvailability } from './embedder.js';
/**
 * Map internal RetrievalCandidate to public MemorySearchResult.
 *
 * This is the critical mapping that enforces the frozen contract.
 * MUST NOT add additional fields beyond the frozen contract.
 *
 * @param candidate - Internal retrieval candidate
 * @returns Public MemorySearchResult (frozen contract)
 */
function mapCandidateToResult(candidate) {
    // Frozen contract fields:
    // - path (required): memory://<scope>/<id>
    // - score (required): final search relevance score
    // - snippet (required): human-readable excerpt
    // - startLine, endLine (optional): line hints
    // - source (optional): classification hint (category)
    // - citation (optional): citation string
    const result = {
        path: candidate.path, // Already in memory://<scope>/<id> format
        score: candidate.finalScore,
        snippet: candidate.snippet,
        // Optional fields - only include if available
        source: candidate.category,
    };
    // Include line hints if available
    if (candidate.startLine !== undefined) {
        result.startLine = candidate.startLine;
    }
    if (candidate.endLine !== undefined) {
        result.endLine = candidate.endLine;
    }
    // Include citation if available from metadata
    if (candidate.metadata?.citation && typeof candidate.metadata.citation === 'string') {
        result.citation = candidate.metadata.citation;
    }
    // IMPORTANT: Do NOT add fields like id, scope, content, createdAt, etc.
    // Those are NOT part of the frozen public contract.
    return result;
}
/**
 * Create search manager instance.
 *
 * Phase 1 skeleton:
 * - Store connection initialized
 * - Lexical search available
 * - Vector search placeholder (requires embedding)
 * - Rerank pass-through (requires rerank provider)
 * - Honest status/probe methods
 *
 * @param config - Plugin configuration
 * @param backendConfig - Backend configuration
 * @returns Search manager instance
 */
export function createSearchManager(config, backendConfig, externalStore // Optional: reuse external store instance
) {
    // Create internal components
    // CRITICAL FIX: Use external store if provided to avoid data isolation
    const store = externalStore ?? createLanceDBStore(backendConfig);
    const rerankManager = createDefaultRerankManager(config.retrieval);
    // Internal state
    let _initialized = false;
    let _retriever = null;
    // Build retrieval availability based on config and reality
    function buildRetrievalAvailability(vectorAvailable) {
        return {
            lexicalAvailable: true, // Phase 1: lexical always available
            vectorAvailable: vectorAvailable,
            hybridAvailable: config.retrieval.hybrid && vectorAvailable, // Hybrid needs both
            embeddingAvailable: buildDashScopeEmbeddingAvailability({ ...config.embedding, dimension: backendConfig.embeddingDimension }).isFunctional,
            vectorUnavailableReason: vectorAvailable ? undefined : 'No populated vectors available',
            embeddingUnavailableReason: buildDashScopeEmbeddingAvailability({ ...config.embedding, dimension: backendConfig.embeddingDimension }).unavailableReason,
        };
    }
    /**
     * Refresh retriever with latest records from store.
     * Called before each search to ensure newly stored data is searchable.
     */
    async function refreshRetriever() {
        if (!store)
            return;
        const vectorAvailability = await store.probeVectorAvailability();
        const retrievalAvailability = buildRetrievalAvailability(vectorAvailability.hasPopulatedVectors);
        const records = await store.list({ limit: 1000 });
        _retriever = createHybridRetriever(records, retrievalAvailability, { ...config.embedding, dimension: backendConfig.embeddingDimension });
    }
    // Build embedding availability (honest)
    function buildEmbeddingAvailability() {
        return buildDashScopeEmbeddingAvailability({ ...config.embedding, dimension: backendConfig.embeddingDimension });
    }
    const manager = {
        async initialize() {
            if (_initialized) {
                return;
            }
            await store.initialize();
            // Get vector availability to configure retriever
            const vectorAvailability = await store.probeVectorAvailability();
            const retrievalAvailability = buildRetrievalAvailability(vectorAvailability.hasPopulatedVectors);
            // Get initial records for retriever (will be enhanced later)
            const records = await store.list({ limit: 1000 });
            _retriever = createHybridRetriever(records, retrievalAvailability, { ...config.embedding, dimension: backendConfig.embeddingDimension });
            _initialized = true;
        },
        async close() {
            if (!_initialized) {
                return;
            }
            await store.close();
            _retriever = null;
            _initialized = false;
        },
        async status() {
            try {
                const storeStatus = await store.status();
                const vectorAvailability = await store.probeVectorAvailability();
                const retrievalAvailability = buildRetrievalAvailability(vectorAvailability.hasPopulatedVectors);
                const embeddingAvailability = buildEmbeddingAvailability();
                const rerankAvailability = await rerankManager.checkAvailability();
                return {
                    ready: _initialized && storeStatus.connected,
                    store: {
                        connected: storeStatus.connected,
                        dbPath: storeStatus.dbPath,
                        tableName: storeStatus.tableName,
                        totalRecords: storeStatus.totalRecords,
                    },
                    retrieval: retrievalAvailability,
                    embedding: embeddingAvailability,
                    vector: vectorAvailability,
                    rerank: rerankAvailability,
                    config: {
                        hybrid: config.retrieval.hybrid,
                        rerank: config.retrieval.rerank,
                        defaultScope: config.defaultScope ?? DEFAULT_SCOPE,
                    },
                };
            }
            catch (_err) {
                // Defensive: return safe fallback to prevent unhandled promise rejection crashes
                return {
                    ready: false,
                    store: {
                        connected: false,
                        dbPath: backendConfig.dbPath,
                        tableName: backendConfig.tableName,
                        totalRecords: 0,
                    },
                    retrieval: buildRetrievalAvailability(false),
                    embedding: buildEmbeddingAvailability(),
                    vector: {
                        hasVectorColumn: false,
                        hasPopulatedVectors: false,
                        unavailableReason: `Status check failed: ${_err instanceof Error ? _err.message : String(_err)}`,
                    },
                    rerank: {
                        hasRerankModule: true,
                        hasRerankProvider: false,
                        isFunctional: false,
                        unavailableReason: 'Status check failed',
                    },
                    config: {
                        hybrid: config.retrieval.hybrid,
                        rerank: config.retrieval.rerank,
                        defaultScope: config.defaultScope ?? DEFAULT_SCOPE,
                    },
                };
            }
        },
        async search(query, options) {
            if (!_initialized || !_retriever) {
                throw new Error('Search manager not initialized');
            }
            if (!query || query.trim() === '') {
                return [];
            }
            // CRITICAL FIX: Refresh retriever with latest records before each search
            // This ensures newly stored data is immediately searchable
            await refreshRetriever();
            // Resolve search mode (from options or config)
            const mode = options?.mode ?? (config.retrieval.hybrid ? 'hybrid' : 'lexical');
            // Build retriever options
            const resolvedScope = options?.scope !== undefined
                ? normalizeScope(options.scope, config.defaultScope)
                : undefined;
            const retrieverOptions = {
                query,
                mode,
                scope: resolvedScope,
                category: options?.category,
                limit: options?.limit ?? 10,
                minScore: options?.minScore ?? 0.1,
            };
            // Get candidates from retriever
            const candidates = await _retriever.retrieve(retrieverOptions);
            // Apply rerank if enabled
            if (config.retrieval.rerank && candidates.length > 0) {
                const rerankResult = await rerankManager.rerank(candidates, {
                    query,
                    enabled: config.retrieval.rerank,
                    maxCandidates: options?.limit ?? 10,
                    minScore: options?.minScore ?? 0.1,
                });
                // Use reranked candidates
                const rerankedCandidates = rerankResult.candidates;
                // Map to public MemorySearchResult (frozen contract)
                return rerankedCandidates.map(mapCandidateToResult);
            }
            // No rerank - directly map to public MemorySearchResult
            return candidates.map(mapCandidateToResult);
        },
        async probeEmbeddingAvailability() {
            return buildEmbeddingAvailability();
        },
        async probeVectorAvailability() {
            return store.probeVectorAvailability();
        },
    };
    return manager;
}
/**
 * Factory function to create and initialize search manager.
 * Convenience method for one-step setup.
 *
 * @param config - Plugin configuration
 * @param backendConfig - Backend configuration
 * @returns Initialized search manager
 */
export async function createAndInitializeSearchManager(config, backendConfig, externalStore // Optional: reuse external store instance
) {
    const manager = createSearchManager(config, backendConfig, externalStore);
    await manager.initialize();
    return manager;
}
//# sourceMappingURL=search-manager.js.map
