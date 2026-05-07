/**
 * Memory Recall Tool - Thin Wrapper
 *
 * Phase 2 minimal implementation.
 * Wraps search-manager.search() for tool consumption.
 *
 * IMPORTANT: This is a THIN WRAPPER - does not reimplement retrieval logic.
 * All actual search work is done by SearchManager.
 */
import { SearchManager } from '../retrieval/search-manager.js';
import { LanceDBStore } from '../store/lancedb-store.js';
import { MemorySearchResult } from '../types/memory-search-result.js';
import { MemoryPluginConfig } from '../config/schema.js';
/**
 * Recall tool options (maps to SearchOptions).
 */
export interface RecallOptions {
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
    /** Retrieval mode override (lexical/vector/hybrid) */
    mode?: 'lexical' | 'vector' | 'hybrid';
    /** Include full text content (default: false - returns summary only) */
    includeFullText?: boolean;
    /** Max chars per item in summary mode (default: 180) */
    maxCharsPerItem?: number;
}
/**
 * Recall tool result wrapper.
 */
export interface RecallResult {
    /** Search results (frozen MemorySearchResult shape) */
    results: MemorySearchResult[];
    /** Total count */
    total: number;
    /** Query used */
    query: string;
    /** Options applied */
    options: Partial<RecallOptions>;
    /** Whether search was successful */
    success: boolean;
    /** Error message if failed */
    error?: string;
}
/**
 * Initialize recall tool with configuration.
 *
 * Must be called before using recall().
 * Typically called by plugin startup.
 *
 * @param config - Plugin configuration
 */
export declare function initializeRecallTool(config: MemoryPluginConfig, externalStore?: LanceDBStore): Promise<void>;
/**
 * Close recall tool (cleanup).
 */
export declare function closeRecallTool(): Promise<void>;
/**
 * Get search manager for direct consumption.
 *
 * Returns the internal SearchManager instance.
 * Throws if not initialized.
 *
 * @returns SearchManager instance
 */
export declare function getRecallSearchManager(): SearchManager;
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
export declare function memoryRecall(options: RecallOptions): Promise<RecallResult>;
/**
 * Get recall tool status.
 *
 * Probes search manager status and availability.
 *
 * @returns Status information
 */
export declare function getRecallStatus(): Promise<{
    initialized: boolean;
    ready: boolean;
    error?: string;
}>;
//# sourceMappingURL=recall.d.ts.map