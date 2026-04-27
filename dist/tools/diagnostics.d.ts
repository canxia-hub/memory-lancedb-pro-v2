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
/**
 * Memory stats input.
 */
export interface MemoryStatsInput {
    /** Scope filter (optional) */
    scope?: string;
}
/**
 * Memory stats result.
 */
export interface MemoryStatsResult {
    /** Total memory count */
    totalMemories: number;
    /** Scope breakdown */
    scopes: {
        name: string;
        count: number;
    }[];
    /** Category breakdown */
    categories: {
        name: string;
        count: number;
    }[];
    /** Layer breakdown (metadata placeholders) */
    layers: {
        name: string;
        count: number;
    }[];
    /** Store status */
    store: {
        connected: boolean;
        dbPath: string;
        tableName: string;
    };
    /** Retrieval status */
    retrieval: {
        lexicalAvailable: boolean;
        vectorAvailable: boolean;
        hybridAvailable: boolean;
        embeddingAvailable: boolean;
    };
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
}
/**
 * Memory debug input.
 */
export interface MemoryDebugInput {
    /** Search query to debug */
    query: string;
    /** Scope filter */
    scope?: string;
    /** Debug mode: pipeline/rank/full */
    mode?: 'pipeline' | 'rank' | 'full';
    /** Max results to debug */
    limit?: number;
}
/**
 * Memory debug result.
 */
export interface MemoryDebugResult {
    /** Query used */
    query: string;
    /** Pipeline trace (if mode=pipeline or full) */
    pipeline?: {
        /** Lexical search results */
        lexical?: {
            count: number;
            topScores: number[];
        };
        /** Vector search results */
        vector?: {
            available: boolean;
            count?: number;
            topScores?: number[];
            unavailableReason?: string;
        };
        /** Hybrid merge */
        hybrid?: {
            enabled: boolean;
            lexicalCount: number;
            vectorCount: number;
            mergedCount: number;
        };
        /** Rerank */
        rerank?: {
            enabled: boolean;
            inputCount: number;
            outputCount: number;
            unavailableReason?: string;
        };
    };
    /** Ranking explanation (if mode=rank or full) */
    ranking?: {
        /** Results with score breakdown */
        results: {
            path: string;
            finalScore: number;
            lexicalScore?: number;
            vectorScore?: number;
            rerankScore?: number;
            components: string[];
        }[];
    };
    /** Full debug (if mode=full) */
    full?: MemoryStatsResult;
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
}
/**
 * Memory stats - thin wrapper over store/retrieval status.
 *
 * Provides statistics about memories and system status.
 *
 * @param input - Stats input (optional scope filter)
 * @returns Stats result
 */
export declare function memoryStats(input?: MemoryStatsInput): Promise<MemoryStatsResult>;
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
export declare function memoryDebug(input: MemoryDebugInput): Promise<MemoryDebugResult>;
/**
 * Get diagnostics status.
 *
 * Returns status about diagnostics capabilities.
 *
 * @returns Diagnostics capability status
 */
export declare function getDiagnosticsStatus(): Promise<{
    /** Whether stats is supported */
    statsSupported: boolean;
    /** Whether debug pipeline mode is supported */
    debugPipelineSupported: boolean;
    /** Whether debug rank mode is supported */
    debugRankSupported: boolean;
    /** Store connected */
    storeConnected: boolean;
    /** Search manager ready */
    searchReady: boolean;
}>;
//# sourceMappingURL=diagnostics.d.ts.map