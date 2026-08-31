/**
 * Memory Promote Tool
 *
 * Applies an explicit state/layer transition to a LanceDB memory record and
 * writes a content-free audit event outside the always-loaded core files.
 * Memory content is never copied into MEMORY.md.
 */
import * as path from 'path';
import * as fs from 'fs';
import { getStoreInstance, getStoreStatus } from './store.js';
import { memoryRecall } from './recall.js';

const PROMOTION_AUDIT_DIR = path.join('memory', 'audit', 'promotions');

function resolveWorkspaceDir() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    return process.env.OPENCLAW_WORKSPACE || path.join(homeDir, '.openclaw', 'workspace');
}

function appendPromotionAudit(event) {
    const workspaceDir = resolveWorkspaceDir();
    const month = event.timestamp.slice(0, 7);
    const auditPath = path.join(workspaceDir, PROMOTION_AUDIT_DIR, `${month}.jsonl`);
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify(event)}\n`, { encoding: 'utf-8' });
    return {
        absolutePath: auditPath,
        relativePath: path.relative(workspaceDir, auditPath),
    };
}
/** Apply a requested governance transition and record a content-free audit. */
export async function memoryPromote(input) {
    const emptyResult = {
        memoryId: input.memoryId ?? '',
        success: false,
        found: false,
        limitations: [],
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
        const sourceMetadata = record.metadata && typeof record.metadata === 'object'
            ? record.metadata
            : {};
        const currentState = sourceMetadata.state ?? 'pending';
        const currentLayer = sourceMetadata.layer ?? 'working';
        const targetState = input.state ?? 'confirmed';
        const targetLayer = input.layer ?? 'durable';
        const legacyPending = sourceMetadata.promotionPending === true;
        const transitionNeeded = currentState !== targetState
            || currentLayer !== targetLayer
            || legacyPending
            || sourceMetadata.promotionStatus !== 'applied';
        const promotedAt = new Date().toISOString();
        const { promotionPending: _legacyPending, ...metadataWithoutLegacyPending } = sourceMetadata;
        const updatedMetadata = {
            ...metadataWithoutLegacyPending,
            state: targetState,
            layer: targetLayer,
            promotionStatus: 'applied',
            promotedAt,
        };
        const memoryPath = `memory://${record.scope}/${record.id}`;
        const whatWasDone = ['Found memory record'];
        let auditPath;
        if (transitionNeeded) {
            await store.update(targetId, { metadata: updatedMetadata }, record.scope);
            try {
                const audit = appendPromotionAudit({
                    schemaVersion: 1,
                    event: 'memory.promoted',
                    timestamp: promotedAt,
                    memoryId: record.id,
                    scope: record.scope,
                    previousState: currentState,
                    newState: targetState,
                    previousLayer: currentLayer,
                    newLayer: targetLayer,
                });
                auditPath = audit.relativePath;
            }
            catch (auditError) {
                try {
                    await store.update(targetId, { metadata: sourceMetadata }, record.scope);
                }
                catch (rollbackError) {
                    throw new Error(`Promotion audit failed and metadata rollback failed: ${auditError}; rollback: ${rollbackError}`);
                }
                throw new Error(`Promotion audit failed; metadata was rolled back: ${auditError}`);
            }
            whatWasDone.push('Applied state/layer metadata transition');
            whatWasDone.push(`Wrote content-free audit event to ${auditPath}`);
        }
        else {
            whatWasDone.push('Memory already matches the requested state/layer; no duplicate audit written');
        }
        return {
            memoryId: targetId,
            success: true,
            found: true,
            previousState: currentState,
            newState: targetState,
            previousLayer: currentLayer,
            newLayer: targetLayer,
            path: memoryPath,
            auditPath,
            stateChanged: transitionNeeded,
            limitations: [],
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
/** Return the live promotion capability status. */
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
        metadataPromotionSupported: true,
        durableLayerSupported: true,
        governanceAuditSupported: true,
        writesCoreMemoryFile: false,
        auditLedgerRelativePath: path.join(PROMOTION_AUDIT_DIR, 'YYYY-MM.jsonl'),
        durableLayerUnavailableReason: '',
        storeConnected,
    };
}
// All exports are at declaration time.
//# sourceMappingURL=promote.js.map
