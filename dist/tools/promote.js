/**
 * Memory Promote Tool - Honest Minimal Layer
 *
 * Phase 2 minimal implementation with HONEST DEGRADATION.
 *
 * IMPORTANT: This is a MINIMAL IMPLEMENTATION with honest limitations.
 *
 * HONEST STATUS DECLARATION:
 * ==========================
 * Current skeleton implementation has LIMITED promote capability.
 *
 * What IS supported:
 * - Basic state tracking (pending -> confirmed placeholder)
 * - Query-based memory lookup
 * - Honest status reporting about limitations
 *
 * What IS NOT supported (requires durable layer completion):
 * - Full durable layer integration (governance state machine)
 * - Memory.md integration (writing to MEMORY.md)
 * - Promotion auditing trail
 * - Layer transitions (working -> durable -> reflection)
 * - Auto-recall governance integration
 *
 * This tool will be enhanced when durable layer is implemented.
 * Until then, promote() will:
 * 1. Find the memory
 * 2. Mark it as "promotion-pending" in metadata
 * 3. Return honest status about what was done and what wasn't
 */
import * as path from 'path';
import * as fs from 'fs';
import { getStoreInstance, getStoreStatus } from './store.js';
import { memoryRecall } from './recall.js';
/**
 * Memory promote - honest minimal implementation.
 *
 * Promotes a memory to confirmed/durable governance state.
 *
 * HONEST STATUS:
 * - Basic state tracking: SUPPORTED (metadata placeholder)
 * - Durable layer integration: NOT SUPPORTED (requires durable layer)
 * - MEMORY.md integration: NOT SUPPORTED (requires durable layer)
 * - Governance auditing: NOT SUPPORTED (requires durable layer)
 *
 * Behavior:
 * - If memoryId found: marks metadata with promotion-pending, returns honest limitations
 * - If durable layer not ready: clearly states what was NOT done
 * - Always returns limitations list so user knows what's incomplete
 *
 * @param input - Promote input
 * @returns Promote result with honest limitations
 */
export async function memoryPromote(input) {
    const emptyResult = {
        memoryId: input.memoryId ?? '',
        success: false,
        found: false,
        limitations: [
            'Full durable layer integration not yet implemented',
            'MEMORY.md integration not yet implemented',
            'Governance auditing not yet implemented',
            'Layer transitions (working/durable/reflection) not yet implemented',
        ],
        whatWasDone: [],
    };
    // Get store instance
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
    // Resolve memoryId (either provided or lookup via query)
    let targetId = input.memoryId;
    let targetScope = input.scope;
    if (!targetId && input.query) {
        // Lookup memory via recall
        const recallResult = await memoryRecall({
            query: input.query,
            scope: input.scope,
            limit: 1,
        });
        if (recallResult.success && recallResult.results.length > 0) {
            // Extract memoryId from path (memory://<scope>/<id>)
            const firstResult = recallResult.results[0];
            // Split on '/' produces: ['memory:', '', '<scope>', '<id>']
            const pathParts = firstResult.path.split('/');
            if (pathParts.length >= 4) {
                targetScope = pathParts[2];
                targetId = pathParts[3];
            }
        }
    }
    if (!targetId) {
        return {
            ...emptyResult,
            error: 'Memory not found - provide memoryId or valid query',
        };
    }
    // Get the memory record
    try {
        const record = await store.get(targetId, targetScope);
        if (!record) {
            return {
                ...emptyResult,
                error: 'Memory not found in store',
            };
        }
        // MINIMAL PROMOTION: Mark metadata with promotion-pending
        // This is NOT a full durable layer promotion - just a metadata placeholder
        const currentState = record.metadata?.state ?? 'pending';
        const currentLayer = record.metadata?.layer ?? 'working';
        const targetState = input.state ?? 'confirmed';
        const targetLayer = input.layer ?? 'durable';
        // Update metadata with promotion markers (PLACEHOLDER)
        const updatedMetadata = {
            ...record.metadata,
            state: targetState,
            layer: targetLayer,
            promotionPending: true, // Honest flag: not yet integrated with durable layer
            promotedAt: new Date().toISOString(),
        };
        // Call LanceDBStore.update() to mark metadata
        await store.update(targetId, { metadata: updatedMetadata }, targetScope);
        // Build honest result
        const memoryPath = `memory://${record.scope}/${record.id}`;
        const whatWasDone = [
            'Found memory record',
            'Updated metadata with promotion markers',
            'Marked promotionPending=true (honest flag)',
        ];
        // Write to MEMORY.md managed block (only for durable layer)
        if (targetLayer === 'durable') {
            try {
                const workspaceDir = 'C:\\Users\\Administrator\\.openclaw\\workspace';
                const mdPath = path.join(workspaceDir, 'MEMORY.md');
                const dateStr = new Date().toISOString().split('T')[0];
                const MANAGED_START = '<!-- MEMORY_LANCEDB_PRO_MANAGED_START -->';
                const MANAGED_END = '<!-- MEMORY_LANCEDB_PRO_MANAGED_END -->';
                const entry = `- [${dateStr}] ${record.content} (promoted: ${targetState})`;
                let content = '';
                if (fs.existsSync(mdPath)) {
                    content = fs.readFileSync(mdPath, 'utf-8');
                }
                const startIdx = content.indexOf(MANAGED_START);
                const endIdx = content.indexOf(MANAGED_END);
                if (startIdx >= 0 && endIdx > startIdx) {
                    // Insert after START marker
                    const before = content.substring(0, startIdx + MANAGED_START.length);
                    const after = content.substring(endIdx);
                    const middle = content.substring(startIdx + MANAGED_START.length, endIdx).trim();
                    const newBlock = middle ? `${middle}\n${entry}\n` : `\n${entry}\n`;
                    fs.writeFileSync(mdPath, `${before}${newBlock}${after}`, 'utf-8');
                }
                else {
                    // Create managed block
                    const block = `\n${MANAGED_START}\n\n## Dreaming Promotions\n\n${entry}\n\n${MANAGED_END}\n`;
                    fs.appendFileSync(mdPath, block, 'utf-8');
                }
                whatWasDone.push('Wrote to MEMORY.md managed block');
            }
            catch (mdError) {
                whatWasDone.push(`MEMORY.md write failed: ${mdError}`);
            }
        }
        // Add honest limitations about what was NOT done
        const limitations = [
            'Full durable layer integration not yet implemented',
            'Governance auditing not yet implemented',
            'Layer transitions not enforced (metadata placeholder only)',
            'Auto-recall governance integration not yet implemented',
        ];
        return {
            memoryId: targetId,
            success: true,
            found: true,
            previousState: currentState,
            newState: targetState,
            previousLayer: currentLayer,
            newLayer: targetLayer,
            path: memoryPath,
            limitations,
            whatWasDone,
        };
    }
    catch (error) {
        return {
            ...emptyResult,
            error: error instanceof Error ? error.message : 'Unknown promote error',
        };
    }
}
/**
 * Get promote status information.
 *
 * Returns honest status about promote capabilities.
 *
 * @returns Promote capability status
 */
export async function getPromoteStatus() {
    let storeConnected = false;
    try {
        const status = await getStoreStatus();
        storeConnected = status.connected;
    }
    catch {
        storeConnected = false;
    }
    return {
        metadataPromotionSupported: true, // Basic metadata marking supported
        durableLayerSupported: false, // NOT YET IMPLEMENTED
        durableLayerUnavailableReason: 'Full durable layer requires: 1) Governance state machine, 2) MEMORY.md integration, 3) Auditing trail, 4) Layer transition enforcement. Current skeleton only supports metadata placeholders.',
        storeConnected,
    };
}
// All exports are at declaration time.
//# sourceMappingURL=promote.js.map