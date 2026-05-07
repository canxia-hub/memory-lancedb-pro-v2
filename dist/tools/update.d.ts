/**
 * Memory Update Tool - Thin Wrapper
 *
 * Phase 2 minimal implementation.
 * Wraps LanceDBStore.update() for tool consumption.
 *
 * IMPORTANT: This is a THIN WRAPPER - does not reimplement update logic.
 * All update work is done by LanceDBStore.
 */
import { MemoryAssetInput, MemoryAssetRecord, SourceType } from '../store/asset-store.js';
/**
 * Memory update input.
 * Extended with multimodal fields (Phase C).
 */
export interface MemoryUpdateInput {
    /** Memory ID (UUID or prefix) - required */
    memoryId: string;
    /** New content text (optional) */
    text?: string;
    /** New scope (optional - triggers re-embedding if scope changes) */
    scope?: string;
    /** New category (optional) */
    category?: string;
    /** New importance score (optional) */
    importance?: number;
    /** New metadata (optional) */
    metadata?: Record<string, unknown>;
    /** Scope filter for lookup (optional) */
    scopeFilter?: string;
    /** New source type (Phase C multimodal) */
    sourceType?: SourceType;
    /** New source reference (Phase C) */
    sourceRef?: string;
    /** Append assets (Phase C) - adds new assets to existing */
    appendAssets?: MemoryAssetInput[];
}
/**
 * Memory update result.
 * Extended with assets info (Phase C).
 */
export interface MemoryUpdateResult {
    /** Memory ID that was updated */
    memoryId?: string;
    /** Updated memory record (display-friendly) */
    record: {
        id: string;
        scope: string;
        content: string;
        category: string;
        importance: number;
        updatedAt: string;
        sourceType?: SourceType;
        sourceRef?: string;
    };
    /** Memory path (memory://<scope>/<id>) */
    path: string;
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
    /** Whether record was found */
    found: boolean;
    /** Asset creation results (Phase C, only if appendAssets provided) */
    appendedAssets?: {
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
 * Memory update - thin wrapper over LanceDBStore.update().
 *
 * Updates an existing memory record.
 * Extended (Phase C) to handle sourceType/sourceRef/appendAssets.
 *
 * IMPORTANT: Does NOT implement update logic itself.
 * All update work is done by LanceDBStore + AssetStore.
 *
 * Behavior:
 * - If memoryId is found: updates specified fields, returns success
 * - If memoryId is not found: returns found=false, success=false
 * - If store not initialized: returns success=false with error
 * - If appendAssets provided: creates new asset records linked to memory
 *
 * @param input - Memory update input
 * @returns Update result
 */
export declare function memoryUpdate(input: MemoryUpdateInput): Promise<MemoryUpdateResult>;
//# sourceMappingURL=update.d.ts.map