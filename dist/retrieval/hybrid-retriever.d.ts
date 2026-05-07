/**
 * Hybrid Retriever - Internal Retrieval Skeleton
 *
 * Phase 1 skeleton provides:
 * - Internal retrieval candidate structure (richer than public MemorySearchResult)
 * - Lexical search dispatch
 * - Vector search placeholder (requires embedding availability)
 * - Hybrid combination logic
 *
 * Internal candidates must be mapped to public MemorySearchResult before export.
 */
import { MemoryRecord } from '../store/lancedb-store.js';
/**
 * Internal retrieval candidate (richer than public MemorySearchResult).
 * Contains additional fields needed for retrieval scoring and ranking,
 * but must be mapped to public contract before leaving search-manager.
 */
export interface RetrievalCandidate {
    /** Record id */
    id: string;
    /** Scope */
    scope: string;
    /** Memory path URI: memory://<scope>/<id> */
    path: string;
    /** Lexical/BM25 score (if available) */
    lexicalScore?: number;
    /** Vector similarity score (if available) */
    vectorScore?: number;
    /** Combined hybrid score */
    hybridScore?: number;
    /** Rerank score (after rerank layer, if applied) */
    rerankScore?: number;
    /** Final score (after all stages) */
    finalScore: number;
    /** Content snippet for display */
    snippet: string;
    /** Full content (may be truncated before export) */
    content: string;
    /** Category */
    category: string;
    /** Importance */
    importance: number;
    /** Created timestamp */
    createdAt: string;
    /** Updated timestamp */
    updatedAt: string;
    /** Line hints (if available) */
    startLine?: number;
    endLine?: number;
    /** Metadata */
    metadata?: Record<string, unknown>;
}
/**
 * Retrieval mode options.
 */
export type RetrievalMode = 'lexical' | 'vector' | 'hybrid';
/**
 * Hybrid retriever options.
 */
export interface HybridRetrieverOptions {
    /** Retrieval mode: lexical/vector/hybrid */
    mode: RetrievalMode;
    /** Search query text */
    query: string;
    /** Scope filter (optional) */
    scope?: string;
    /** Category filter (optional) */
    category?: string;
    /** Maximum results */
    limit?: number;
    /** Minimum score threshold */
    minScore?: number;
    /** Lexical weight for hybrid (default: 0.5) */
    lexicalWeight?: number;
    /** Vector weight for hybrid (default: 0.5) */
    vectorWeight?: number;
}
/**
 * Retrieval availability status.
 */
export interface RetrievalAvailability {
    /** Lexical/BM25 search available */
    lexicalAvailable: boolean;
    /** Vector search available */
    vectorAvailable: boolean;
    /** Hybrid search available */
    hybridAvailable: boolean;
    /** Embedding provider available */
    embeddingAvailable: boolean;
    /** Reason if vector unavailable */
    vectorUnavailableReason?: string;
    /** Reason if embedding unavailable */
    embeddingUnavailableReason?: string;
}
/**
 * Hybrid retriever interface.
 */
export interface HybridRetriever {
    /** Retrieve candidates using specified mode */
    retrieve(options: HybridRetrieverOptions): Promise<RetrievalCandidate[]>;
    /** Check retrieval availability */
    checkAvailability(): Promise<RetrievalAvailability>;
    /** Lexical search (BM25-like) */
    lexicalSearch(query: string, options?: Partial<HybridRetrieverOptions>): Promise<RetrievalCandidate[]>;
    /** Vector search placeholder (requires embedding) */
    vectorSearch(query: string, options?: Partial<HybridRetrieverOptions>): Promise<RetrievalCandidate[]>;
    /** Combine lexical and vector results */
    combineResults(lexical: RetrievalCandidate[], vector: RetrievalCandidate[], options?: {
        lexicalWeight?: number;
        vectorWeight?: number;
    }): RetrievalCandidate[];
}
/**
 * Simple lexical search implementation.
 *
 * Phase 1 uses basic text matching (not full BM25).
 * Will be enhanced when proper BM25 implementation is available.
 *
 * @param query - Search query
 * @param records - Memory records to search
 * @param options - Search options
 * @returns Matching candidates with lexical scores
 */
export declare function simpleLexicalSearch(query: string, records: MemoryRecord[], options?: Partial<HybridRetrieverOptions>): RetrievalCandidate[];
/**
 * Truncate content to snippet.
 *
 * @param content - Full content
 * @param maxLength - Maximum snippet length
 * @returns Truncated snippet
 */
export declare function truncateSnippet(content: string, maxLength?: number): string;
/**
 * Create hybrid retriever instance.
 *
 * Phase 1 skeleton:
 * - Lexical search is available (simple implementation)
 * - Vector search is placeholder (requires embedding provider)
 * - Hybrid is available but vector path will return empty
 *
 * @param records - Memory records (from store)
 * @param availability - Retrieval availability status
 * @returns Hybrid retriever instance
 */
export declare function createHybridRetriever(records: MemoryRecord[], availability: RetrievalAvailability): HybridRetriever;
//# sourceMappingURL=hybrid-retriever.d.ts.map