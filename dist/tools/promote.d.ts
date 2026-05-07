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
/**
 * Memory promotion state.
 *
 * NOTE: These states are MINIMAL placeholders.
 * Full governance state machine requires durable layer implementation.
 */
export type MemoryState = 'pending' | 'confirmed' | 'archived';
/**
 * Memory promotion layer.
 *
 * NOTE: These layers are MINIMAL placeholders.
 * Full layer system requires durable layer implementation.
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
    /** State after promotion (placeholder) */
    newState?: MemoryState;
    /** Layer before promotion */
    previousLayer?: MemoryLayer;
    /** Layer after promotion (placeholder) */
    newLayer?: MemoryLayer;
    /** Memory path */
    path?: string;
    /** Error if failed */
    error?: string;
    /** HONEST LIMITATIONS NOTICE */
    limitations: string[];
    /** What was actually done */
    whatWasDone: string[];
}
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
    /** Reason if durable layer not supported */
    durableLayerUnavailableReason: string;
    /** Store status */
    storeConnected: boolean;
}>;
//# sourceMappingURL=promote.d.ts.map