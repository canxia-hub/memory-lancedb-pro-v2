/**
 * Memory Promote Tool
 *
 * Applies state/layer metadata transitions and writes content-free audit
 * events outside always-loaded core files. It never copies memory content
 * into MEMORY.md.
 */
/**
 * Memory promotion state.
 *
 * States persisted in memory metadata by memory_promote.
 */
export type MemoryState = 'pending' | 'confirmed' | 'archived';
/**
 * Memory promotion layer.
 *
 * Layers persisted in memory metadata by memory_promote.
 */
export type MemoryLayer = 'working' | 'durable' | 'reflection' | 'archive';
/**
 * Memory promote input.
 */
export interface MemoryPromoteInput {
    /** Memory ID (UUID) - optional if query provided */
    memoryId?: string;
    /** Search query to find memory (optional if memoryId provided) */
    query?: string;
    /** Scope filter */
    scope?: string;
    /** Target state */
    state?: MemoryState;
    /** Target layer */
    layer?: MemoryLayer;
}
/**
 * Memory promote result.
 */
export interface MemoryPromoteResult {
    /** Memory ID that was processed */
    memoryId: string;
    /** Success indicator */
    success: boolean;
    /** Whether memory was found */
    found: boolean;
    /** State before promotion */
    previousState?: MemoryState;
    /** State after promotion */
    newState?: MemoryState;
    /** Layer before promotion */
    previousLayer?: MemoryLayer;
    /** Layer after promotion */
    newLayer?: MemoryLayer;
    /** Memory path */
    path?: string;
    /** Relative path to the content-free promotion audit ledger */
    auditPath?: string;
    /** Whether metadata changed and a new audit event was written */
    stateChanged?: boolean;
    /** Error if failed */
    error?: string;
    /** Remaining limitations, if any */
    limitations: string[];
    /** What was actually done */
    whatWasDone: string[];
}
/**
 * Apply a requested governance transition and record a content-free audit.
 *
 * @param input - Promote input
 * @returns Promote result
 */
export declare function memoryPromote(input: MemoryPromoteInput): Promise<MemoryPromoteResult>;
/**
 * Get promote status information.
 *
 * Returns honest status about promote capabilities.
 *
 * @returns Promote capability status
 */
export declare function getPromoteStatus(): Promise<{
    /** Whether basic metadata promotion is supported */
    metadataPromotionSupported: boolean;
    /** Whether full durable layer is supported */
    durableLayerSupported: boolean;
    /** Whether content-free promotion audit is supported */
    governanceAuditSupported: boolean;
    /** Core MEMORY.md is never written by promotion */
    writesCoreMemoryFile: boolean;
    /** Relative audit ledger pattern */
    auditLedgerRelativePath: string;
    /** Reason if durable layer not supported */
    durableLayerUnavailableReason: string;
    /** Store status */
    storeConnected: boolean;
}>;
//# sourceMappingURL=promote.d.ts.map
