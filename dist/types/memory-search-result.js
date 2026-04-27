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
export {};
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
//# sourceMappingURL=memory-search-result.js.map