/**
 * MemorySearchResult - Frozen Public Shared-Search Contract
 *
 * This is the public shared-search result contract consumed across:
 * - retrieval search-manager
 * - memory capability runtime
 * - memory-wiki / bridge consumers
 * - host diagnostics / doctor-compatible search flows
 *
 * Contract frozen by main thread on 2026-04-23.
 * DO NOT add additional fields without main thread approval.
 */
/**
 * Public shared-search result shape.
 * Internal retrieval records may have richer structures,
 * but must be mapped into this public contract before leaving search-manager.
 */
export interface MemorySearchResult {
    /**
     * Required. Format: memory://<scope>/<id>
     * scope comes from resolved memory scope
     * id comes from durable record identifier
     */
    path: string;
    /**
     * Required. Final search relevance score exposed to shared-search consumers.
     * May come from rerank score when rerank exists; otherwise fallback to hybrid/base score.
     */
    score: number;
    /**
     * Required. Human-readable content excerpt.
     * Must be safe to display in shared consumers.
     * Should be truncated consistently rather than exposing arbitrary full payloads.
     */
    snippet: string;
    /**
     * Optional. Line hint when source can support stable line provenance.
     * Omit when unavailable; do not fabricate.
     */
    startLine?: number;
    /**
     * Optional. Line hint when source can support stable line provenance.
     * Omit when unavailable; do not fabricate.
     */
    endLine?: number;
    /**
     * Optional. Classification hint, typically category.
     * Should stay compact and stable.
     */
    source?: string;
    /**
     * Optional. Citation string derived from metadata when available.
     * Omit when unavailable; do not invent.
     */
    citation?: string;
}
/**
 * Explicit Non-Fields (NOT part of public shared-search contract):
 * - id
 * - scope
 * - uri
 * - content
 * - createdAt
 * - arbitrary metadata
 *
 * These may exist internally, but must NOT leak into public shared-search contract
 * unless main thread explicitly revises the frozen contract.
 */ 
//# sourceMappingURL=memory-search-result.d.ts.map