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
import { LanceDBStore } from '../store/lancedb-store.js';
import { MemoryPluginConfig } from '../config/schema.js';
import { MemoryAssetInput, MemoryAssetRecord, SourceType } from '../store/asset-store.js';
/**
 * Memory store input (maps to MemoryRecordInput).
 * Extended with multimodal fields (Phase C).
 */
export interface MemoryStoreInput {
    /** Memory content text */
    text: string;
    /** Scope (optional) */
    scope?: string;
    /** Category: preference/fact/decision/entity/reflection/other */
    category?: string;
    /** Importance score 0-1 (default: 0.7) */
    importance?: number;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** Source type (Phase C multimodal): text/image/audio/video/file/compound */
    sourceType?: SourceType;
    /** Source reference (optional): path or URL to source */
    sourceRef?: string;
    /** Assets array (Phase C multimodal): image/audio/video/file assets */
    assets?: MemoryAssetInput[];
}
/**
 * Memory store result.
 * Extended with assets info (Phase C).
 */
export interface MemoryStoreResult {
    /** Created memory record (internal structure, may be truncated for display) */
    record: {
        id: string;
        scope: string;
        content: string;
        category: string;
        importance: number;
        createdAt: string;
        sourceType?: SourceType;
        sourceRef?: string;
    };
    /** Memory path (memory://<scope>/<id>) */
    path: string;
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
    /** Asset creation results (Phase C, only if assets provided) */
    assets?: {
        /** Created asset records */
        records: MemoryAssetRecord[];
        /** Success count */
        successCount: number;
        /** Fail count */
        failCount: number;
        /** Errors */
        errors: Array<{
            index: number;
            error: string;
        }>;
    };
}
/**
 * Memory list options (maps to StoreQueryOptions).
 */
export interface MemoryListOptions {
    /** Scope filter */
    scope?: string;
    /** Category filter */
    category?: string;
    /** Max results (default: 10, max: 50) */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Order by field */
    orderBy?: 'createdAt' | 'updatedAt' | 'importance';
    /** Order direction */
    orderDirection?: 'asc' | 'desc';
}
/**
 * Memory list result item (display-friendly).
 */
export interface MemoryListItem {
    /** Memory ID */
    memoryId: string;
    /** Memory scope */
    scope: string;
    /** Memory path */
    path: string;
    /** Summary preview (truncated) */
    summary: string;
    /** Category */
    category: string;
    /** Importance */
    importance: number;
    /** Created timestamp */
    createdAt: string;
}
/**
 * Memory list result.
 */
export interface MemoryListResult {
    /** Memory items */
    memories: MemoryListItem[];
    /** Total count */
    total: number;
    /** Has more items */
    hasMore: boolean;
    /** Options applied */
    options: MemoryListOptions;
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
}
/**
 * Initialize store tool with configuration.
 *
 * Must be called before using store/list functions.
 *
 * @param config - Plugin configuration
 * @param externalStore - Optional external store instance to reuse
 */
export declare function initializeStoreTool(config: MemoryPluginConfig, externalStore?: LanceDBStore): Promise<void>;
/**
 * Close store tool (cleanup).
 */
export declare function closeStoreTool(): Promise<void>;
/**
 * Get store instance for direct consumption.
 *
 * @returns LanceDBStore instance
 */
export declare function getStoreInstance(): LanceDBStore;
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
export declare function memoryStore(input: MemoryStoreInput): Promise<MemoryStoreResult>;
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
export declare function memoryList(options?: MemoryListOptions): Promise<MemoryListResult>;
/**
 * Get store status.
 *
 * Probes store connection and stats.
 *
 * @returns Status information
 */
export declare function getStoreStatus(): Promise<{
    initialized: boolean;
    connected: boolean;
    totalRecords: number;
    error?: string;
}>;
//# sourceMappingURL=store.d.ts.map