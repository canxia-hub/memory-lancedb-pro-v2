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
import { getStoreInstance } from './store.js';
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
export async function memoryArchive(input) {
    const emptyResult = {
        memoryId: input.memoryId,
        success: false,
        found: false,
        wasHardDelete: false,
    };
    // Get store instance (throws if not initialized)
    let store;
    try {
        store = getStoreInstance();
    }
    catch (error) {
        return {
            ...emptyResult,
            error: 'Store tool not initialized - call initializeStoreTool() first',
        };
    }
    // Validate memoryId
    if (!input.memoryId || input.memoryId.trim() === '') {
        return {
            ...emptyResult,
            error: 'memoryId is required',
        };
    }
    // HONEST STATUS CHECK: soft archive not yet supported
    const hardDelete = input.hard ?? true; // Default to hard delete (the only supported mode)
    if (!hardDelete) {
        // Soft archive requested but NOT SUPPORTED in current skeleton
        return {
            ...emptyResult,
            error: 'Soft archive (hard=false) is NOT YET SUPPORTED. Current implementation only supports hard delete. Soft archive requires: 1) archived/archivedAt schema fields, 2) query filters to exclude archived records. Use hard=true for permanent delete, or wait for schema extension.',
            wasHardDelete: false,
            reason: input.reason,
        };
    }
    // Hard delete requested - this IS supported
    try {
        // Call LanceDBStore.delete() - THIS IS THE CORE WORK
        const deleted = await store.delete(input.memoryId, input.scope);
        if (!deleted) {
            return {
                ...emptyResult,
                error: 'Memory not found',
                wasHardDelete: true,
            };
        }
        return {
            memoryId: input.memoryId,
            success: true,
            found: true,
            wasHardDelete: true,
            reason: input.reason,
        };
    }
    catch (error) {
        return {
            ...emptyResult,
            error: error instanceof Error ? error.message : 'Unknown delete error',
            wasHardDelete: true,
        };
    }
}
/**
 * Get archive status information.
 *
 * Returns honest status about archive capabilities.
 *
 * @returns Archive capability status
 */
export async function getArchiveStatus() {
    let storeConnected = false;
    try {
        const store = getStoreInstance();
        const status = await store.status();
        storeConnected = status.connected;
    }
    catch {
        storeConnected = false;
    }
    return {
        hardDeleteSupported: true, // Supported via LanceDBStore.delete()
        softArchiveSupported: false, // NOT YET IMPLEMENTED
        softArchiveUnavailableReason: 'Soft archive requires schema extension (archived/archivedAt fields) and query filters. Current skeleton only supports hard delete.',
        storeConnected,
    };
}
// All exports are at declaration time.
//# sourceMappingURL=archive.js.map