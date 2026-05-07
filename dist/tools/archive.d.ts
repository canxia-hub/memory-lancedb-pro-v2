/**
 * Memory Archive Tool - Thin Wrapper
 *
 * Phase 2 minimal implementation.
 * Wraps LanceDBStore.delete() for tool consumption.
 *
 * IMPORTANT: This is a THIN WRAPPER - does not reimplement delete logic.
 * All actual deletion work is done by LanceDBStore.
 *
 * HONEST STATUS DECLARATION:
 * ==========================
 * Current skeleton implementation only supports HARD DELETE.
 * Soft archive (marking records as archived without deletion) is NOT YET IMPLEMENTED.
 *
 * The soft-archive feature requires:
 * 1. Schema extension for archived/archivedAt fields
 * 2. Query filters to exclude archived records
 * 3. Archive state management layer
 *
 * This tool will be enhanced when those capabilities are added.
 * Until then, use hard=true for permanent deletion, or be aware that
 * hard=false is NOT supported (will return success=false with clear error).
 */
/**
 * Memory archive/delete input.
 */
export interface MemoryArchiveInput {
    /** Memory ID (UUID or prefix) - required */
    memoryId: string;
    /** Scope filter for lookup (optional) */
    scope?: string;
    /** Hard delete (permanent) vs soft archive */
    hard?: boolean;
    /** Reason for archive/delete (audit trail) */
    reason?: string;
}
/**
 * Memory archive result.
 */
export interface MemoryArchiveResult {
    /** Memory ID that was processed */
    memoryId: string;
    /** Success indicator */
    success: boolean;
    /** Whether memory was found */
    found: boolean;
    /** Whether hard delete was applied */
    wasHardDelete: boolean;
    /** Error if failed */
    error?: string;
    /** Reason provided (audit trail) */
    reason?: string;
}
/**
 * Memory archive - thin wrapper over LanceDBStore.delete().
 *
 * Archives or deletes a memory record.
 *
 * IMPORTANT: Does NOT implement delete logic itself.
 * All delete work is done by LanceDBStore.
 *
 * HONEST STATUS:
 * - hard=true: Supported (permanent delete via LanceDBStore.delete())
 * - hard=false: NOT SUPPORTED YET (soft archive requires schema extension)
 *
 * Behavior:
 * - If hard=true and memoryId found: permanently deletes, returns success=true
 * - If hard=false: returns success=false with clear "not supported" error
 * - If memoryId not found: returns found=false, success=false
 *
 * @param input - Archive input
 * @returns Archive result
 */
export declare function memoryArchive(input: MemoryArchiveInput): Promise<MemoryArchiveResult>;
/**
 * Get archive status information.
 *
 * Returns honest status about archive capabilities.
 *
 * @returns Archive capability status
 */
export declare function getArchiveStatus(): Promise<{
    /** Whether hard delete is supported */
    hardDeleteSupported: boolean;
    /** Whether soft archive is supported */
    softArchiveSupported: boolean;
    /** Reason if soft archive not supported */
    softArchiveUnavailableReason: string;
    /** Store status */
    storeConnected: boolean;
}>;
//# sourceMappingURL=archive.d.ts.map