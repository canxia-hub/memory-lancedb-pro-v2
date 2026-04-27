/**
 * Rerank Layer - Minimal Pass-Through Implementation
 *
 * Phase 1 skeleton: provides rerank interface but does NOT
 * implement actual reranking logic. Honest about current state.
 *
 * When rerank is disabled or not available, this module acts
 * as a stable pass-through (identity function) for candidates.
 */
/**
 * Phase 1 honest rerank availability.
 * Rerank is NOT functional in Phase 1 skeleton.
 */
export const RERANK_AVAILABILITY_PHASE1 = {
    hasRerankModule: true, // This module exists
    hasRerankProvider: false, // No rerank provider configured
    isFunctional: false, // Honest: not functional
    unavailableReason: 'Rerank not implemented in Phase 1 - requires rerank provider/model integration',
};
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
export function createRerankManager(availability) {
    const manager = {
        async rerank(candidates, options) {
            const startTime = Date.now();
            // If rerank is disabled, pass through unchanged
            if (!options.enabled) {
                return {
                    candidates,
                    rerankApplied: false,
                    rerankCount: 0,
                    durationMs: Date.now() - startTime,
                    skipReason: 'Rerank disabled by configuration',
                };
            }
            // If rerank is not available, pass through with warning
            if (!availability.isFunctional) {
                return {
                    candidates,
                    rerankApplied: false,
                    rerankCount: 0,
                    durationMs: Date.now() - startTime,
                    skipReason: availability.unavailableReason,
                };
            }
            // Phase 1 placeholder: when rerank becomes available:
            // 1. Call rerank provider with query + candidate contents
            // 2. Get rerank scores
            // 3. Update candidates.rerankScore and finalScore
            // 4. Sort by rerankScore
            // Current: pass-through since rerank not functional
            return {
                candidates: candidates.map(c => ({
                    ...c,
                    rerankScore: c.finalScore, // Copy existing score as rerank score
                    finalScore: c.finalScore, // Keep existing as final
                })),
                rerankApplied: false,
                rerankCount: candidates.length,
                durationMs: Date.now() - startTime,
                modelUsed: availability.rerankModel,
                skipReason: 'Rerank pass-through (not yet functional)',
            };
        },
        async checkAvailability() {
            return availability;
        },
    };
    return manager;
}
/**
 * Default rerank manager for Phase 1.
 * Uses honest availability assessment.
 */
export function createDefaultRerankManager() {
    return createRerankManager(RERANK_AVAILABILITY_PHASE1);
}
//# sourceMappingURL=rerank.js.map