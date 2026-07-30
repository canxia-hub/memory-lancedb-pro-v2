/**
 * Hybrid Retriever - Internal Retrieval with FTS + Vector + Lexical
 *
 * Upgraded for LanceDB 0.33.0:
 * - FTS (BM25) full-text search via LanceDB native index
 * - Vector search with native cosine distanceType
 * - Lexical search as fallback
 * - Hybrid combination with configurable weights
 */
import { MemoryRecord, LanceDBStore } from '../store/lancedb-store.js';
/**
 * Internal retrieval candidate (richer than public MemorySearchResult).
 */
export interface RetrievalCandidate {
    id: string;
    scope: string;
    path: string;
    lexicalScore?: number;
    vectorScore?: number;
    ftsScore?: number;
    hybridScore?: number;
    rerankScore?: number;
    finalScore: number;
    snippet: string;
    content: string;
    category: string;
    importance: number;
    createdAt: string;
    updatedAt: string;
    startLine?: number;
    endLine?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Retrieval mode options.
 */
export type RetrievalMode = 'lexical' | 'vector' | 'fts' | 'hybrid';
/**
 * Hybrid retriever options.
 */
export interface HybridRetrieverOptions {
    mode: RetrievalMode;
    query: string;
    scope?: string;
    category?: string;
    limit?: number;
    minScore?: number;
    lexicalWeight?: number;
    vectorWeight?: number;
    ftsWeight?: number;
}
/**
 * Retrieval availability status.
 */
export interface RetrievalAvailability {
    lexicalAvailable: boolean;
    vectorAvailable: boolean;
    ftsAvailable: boolean;
    hybridAvailable: boolean;
    embeddingAvailable: boolean;
    vectorUnavailableReason?: string;
    embeddingUnavailableReason?: string;
}
/**
 * Hybrid retriever interface.
 */
export interface HybridRetriever {
    retrieve(options: HybridRetrieverOptions): Promise<RetrievalCandidate[]>;
    checkAvailability(): Promise<RetrievalAvailability>;
    lexicalSearch(query: string, options?: Partial<HybridRetrieverOptions>): Promise<RetrievalCandidate[]>;
    vectorSearch(query: string, options?: Partial<HybridRetrieverOptions>): Promise<RetrievalCandidate[]>;
    ftsSearch(query: string, options?: Partial<HybridRetrieverOptions>): Promise<RetrievalCandidate[]>;
    combineResults(lexical: RetrievalCandidate[], vector: RetrievalCandidate[], options?: {
        lexicalWeight?: number;
        vectorWeight?: number;
    }): RetrievalCandidate[];
    mergeFtsResults(combined: RetrievalCandidate[], ftsResults: RetrievalCandidate[], options?: {
        ftsWeight?: number;
        vectorWeight?: number;
        lexicalWeight?: number;
    }): RetrievalCandidate[];
}
export declare function simpleLexicalSearch(query: string, records: MemoryRecord[], options?: Partial<HybridRetrieverOptions>): RetrievalCandidate[];
export declare function truncateSnippet(content: string, maxLength?: number): string;
export declare function createHybridRetriever(records: MemoryRecord[], availability: RetrievalAvailability, embeddingConfig?: Record<string, unknown>, storeRef?: LanceDBStore | null): HybridRetriever;
//# sourceMappingURL=hybrid-retriever.js.map
