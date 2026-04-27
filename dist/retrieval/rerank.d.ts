/**
 * Rerank Layer - Minimal Pass-Through Implementation
 *
 * Phase 1 skeleton: provides rerank interface but does NOT
 * implement actual reranking logic. Honest about current state.
 *
 * When rerank is disabled or not available, this module acts
 * as a stable pass-through (identity function) for candidates.
 */
import { RetrievalCandidate } from './hybrid-retriever.js';
/**
 * Rerank options.
 */
export interface RerankOptions {
    /** Original search query */
    query: string;
    /** Whether to apply rerank (default: false for Phase 1) */
    enabled: boolean;
    /** Rerank model/provider name (optional) */
    model?: string;
    /** Maximum candidates to rerank */
    maxCandidates?: number;
    /** Minimum score after rerank */
    minScore?: number;
}
/**
 * Rerank result.
 */
export interface RerankResult {
    /** Reranked candidates (sorted by rerankScore) */
    candidates: RetrievalCandidate[];
    /** Whether rerank was actually applied */
    rerankApplied: boolean;
    /** Rerank model used (if applied) */
    modelUsed?: string;
    /** Number of candidates reranked */
    rerankCount: number;
    /** Duration in milliseconds */
    durationMs: number;
    /** Reason if rerank was not applied */
    skipReason?: string;
}
/**
 * Rerank availability status.
 */
export interface RerankAvailability {
    /** Whether rerank module exists */
    hasRerankModule: boolean;
    /** Whether rerank provider is configured */
    hasRerankProvider: boolean;
    /** Rerank model name (if configured) */
    rerankModel?: string;
    /** Whether rerank is functional */
    isFunctional: boolean;
    /** Reason if not functional */
    unavailableReason?: string;
}
/**
 * Rerank manager interface.
 */
export interface RerankManager {
    /** Rerank candidates (or pass-through if disabled) */
    rerank(candidates: RetrievalCandidate[], options: RerankOptions): Promise<RerankResult>;
    /** Check rerank availability */
    checkAvailability(): Promise<RerankAvailability>;
}
/**
 * Phase 1 honest rerank availability.
 * Rerank is NOT functional in Phase 1 skeleton.
 */
export declare const RERANK_AVAILABILITY_PHASE1: RerankAvailability;
/**
 * Create rerank manager.
 *
 * Phase 1 skeleton:
 * - Provides rerank interface
 * - Pass-through (identity) when rerank is disabled
 * - Honest about not having functional rerank
 *
 * @param availability - Rerank availability status
 * @returns Rerank manager instance
 */
export declare function createRerankManager(availability: RerankAvailability): RerankManager;
/**
 * Default rerank manager for Phase 1.
 * Uses honest availability assessment.
 */
export declare function createDefaultRerankManager(): RerankManager;
//# sourceMappingURL=rerank.d.ts.map