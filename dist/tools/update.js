/**
 * Memory Update Tool - Thin Wrapper
 *
 * Phase 2 minimal implementation.
 * Wraps LanceDBStore.update() for tool consumption.
 *
 * IMPORTANT: This is a THIN WRAPPER - does not reimplement update logic.
 * All update work is done by LanceDBStore.
 */
import { getStoreInstance } from './store.js';
import { getAssetStore, } from '../store/asset-store.js';
/**
 * Build memory path from scope and id.
 */
function buildMemoryPath(scope, id) {
    return `memory://${scope}/${id}`;
}
/**
 * Truncate content for display.
 */
function truncateForDisplay(content, maxChars = 180) {
    if (content.length <= maxChars) {
        return content;
    }
    return content.substring(0, maxChars) + '...';
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
export async function memoryUpdate(input) {
    const emptyResult = {
        memoryId: input.memoryId,
        record: {
            id: '',
            scope: '',
            content: '',
            category: '',
            importance: 0,
            updatedAt: '',
        },
        path: '',
        success: false,
        found: false,
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
    // Validate that at least one update field is provided (including Phase C fields)
    if (!input.text && !input.scope && !input.category && !input.importance && !input.metadata &&
        !input.sourceType && !input.sourceRef && !input.appendAssets) {
        return {
            ...emptyResult,
            error: 'At least one update field is required',
        };
    }
    try {
        // Build update partial (thin wrapper)
        const updates = {};
        if (input.text) {
            updates.content = input.text;
        }
        if (input.scope) {
            updates.scope = input.scope;
        }
        if (input.category) {
            updates.category = input.category;
        }
        if (input.importance !== undefined) {
            updates.importance = input.importance;
        }
        // Phase C: Include sourceType/sourceRef in metadata
        if (input.metadata || input.sourceType || input.sourceRef) {
            const existingMetadata = input.metadata ?? {};
            const enrichedMetadata = {
                ...existingMetadata,
                ...(input.sourceType && { sourceType: input.sourceType }),
                ...(input.sourceRef && { sourceRef: input.sourceRef }),
            };
            updates.metadata = enrichedMetadata;
        }
        // Call LanceDBStore.update() - THIS IS THE CORE WORK
        const record = await store.update(input.memoryId, updates, input.scopeFilter);
        if (!record) {
            return {
                ...emptyResult,
                memoryId: input.memoryId,
                error: 'Memory not found',
            };
        }
        // Build memory path
        const path = buildMemoryPath(record.scope, record.id);
        // Phase C: Handle appendAssets if provided
        let appendedAssetsResult = undefined;
        if (input.appendAssets && input.appendAssets.length > 0) {
            try {
                const assetStore = getAssetStore();
                const batchResult = await assetStore.batchCreate(record.id, input.appendAssets);
                appendedAssetsResult = {
                    records: batchResult.assets,
                    successCount: batchResult.successCount,
                    failCount: batchResult.failCount,
                    errors: batchResult.errors,
                };
            }
            catch (assetError) {
                // Memory updated but assets failed
                return {
                    record: {
                        id: record.id,
                        scope: record.scope,
                        content: truncateForDisplay(record.content),
                        category: record.category,
                        importance: record.importance,
                        updatedAt: record.updatedAt,
                        sourceType: input.sourceType,
                        sourceRef: input.sourceRef,
                    },
                    path,
                    success: true,
                    found: true,
                    error: `Memory updated but asset append failed: ${assetError instanceof Error ? assetError.message : 'Unknown asset error'}`,
                };
            }
        }
        // Return display-friendly result
        return {
            record: {
                id: record.id,
                scope: record.scope,
                content: truncateForDisplay(record.content),
                category: record.category,
                importance: record.importance,
                updatedAt: record.updatedAt,
                sourceType: input.sourceType,
                sourceRef: input.sourceRef,
            },
            path,
            success: true,
            found: true,
            ...(appendedAssetsResult && { appendedAssets: appendedAssetsResult }),
        };
    }
    catch (error) {
        return {
            ...emptyResult,
            error: error instanceof Error ? error.message : 'Unknown update error',
        };
    }
}
// All exports are at declaration time.
//# sourceMappingURL=update.js.map