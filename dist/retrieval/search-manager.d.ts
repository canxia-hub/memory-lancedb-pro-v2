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
import { MemorySearchResult } from '../types/memory-search-result.js';
import { MemoryBackendConfig } from '../config/resolve-backend-config.js';
import { MemoryPluginConfig } from '../config/schema.js';
import { LanceDBStore, VectorAvailability } from '../store/lancedb-store.js';
import { RetrievalAvailability } from './hybrid-retriever.js';
import { RerankAvailability } from './rerank.js';
/**
 * Search options for public search interface.
 */
export interface SearchOptions {
    /** Search query text */
    query: string;
    /** Scope filter (optional) */
    scope?: string;
    /** Category filter (optional) */
    category?: string;
    /** Maximum results (default: 10) */
    limit?: number;
    /** Minimum score threshold (default: 0.1) */
    minScore?: number;
    /** Retrieval mode override (default: from config) */
    mode?: 'lexical' | 'vector' | 'hybrid';
}
/**
 * Embedding availability status.
 */
export interface EmbeddingAvailability {
    /** Whether embedding provider is configured */
    hasProvider: boolean;
    /** Provider name (if configured) */
    providerName?: string;
    /** Embedding dimension (if known) */
    dimension?: number;
    /** Whether embedding is functional */
    isFunctional: boolean;
    /** Reason if not functional */
    unavailableReason?: string;
}
/**
 * Search manager status.
 */
export interface SearchManagerStatus {
    /** Whether search manager is ready */
    ready: boolean;
    /** Store status */
    store: {
        connected: boolean;
        dbPath: string;
        tableName: string;
        totalRecords: number;
    };
    /** Retrieval availability */
    retrieval: RetrievalAvailability;
    /** Embedding availability */
    embedding: EmbeddingAvailability;
    /** Vector availability */
    vector: VectorAvailability;
    /** Rerank availability */
    rerank: RerankAvailability;
    /** Configuration summary */
    config: {
        hybrid: boolean;
        rerank: boolean;
        defaultScope: string;
    };
}
/**
 * Search manager interface.
 */
export interface SearchManager {
    /** Get comprehensive status */
    status(): Promise<SearchManagerStatus>;
    /** Search memories, returns public MemorySearchResult[] */
    search(query: string, options?: Partial<SearchOptions>): Promise<MemorySearchResult[]>;
    /** Probe embedding availability */
    probeEmbeddingAvailability(): Promise<EmbeddingAvailability>;
    /** Probe vector availability */
    probeVectorAvailability(): Promise<VectorAvailability>;
    /** Initialize search manager (connect store) */
    initialize(): Promise<void>;
    /** Close search manager (disconnect store) */
    close(): Promise<void>;
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
export declare function createSearchManager(config: MemoryPluginConfig, backendConfig: MemoryBackendConfig, externalStore?: LanceDBStore): SearchManager;
/**
 * Factory function to create and initialize search manager.
 * Convenience method for one-step setup.
 *
 * @param config - Plugin configuration
 * @param backendConfig - Backend configuration
 * @returns Initialized search manager
 */
export declare function createAndInitializeSearchManager(config: MemoryPluginConfig, backendConfig: MemoryBackendConfig, externalStore?: LanceDBStore): Promise<SearchManager>;
//# sourceMappingURL=search-manager.d.ts.map