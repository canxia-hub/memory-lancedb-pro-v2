/**
 * Wiki Supplement - Batch B implementation
 *
 * Provides wiki corpus supplement and prompt supplement for memory-lancedb-pro-v2.
 * Integrates with existing v2 wiki capabilities (wiki-store, wiki-graph).
 *
 * Reference: upstream memory-wiki corpus-supplement.ts + prompt-section.ts
 */
import type { MemoryPluginConfig } from '../config/schema.js';
/**
 * Wiki corpus supplement interface (matches upstream pattern)
 */
export interface WikiCorpusSupplement {
    search: (input: {
        query: string;
        maxResults?: number;
        agentSessionKey?: string;
    }) => Promise<WikiSearchResult[]>;
    get: (input: {
        lookup: string;
        fromLine?: number;
        lineCount?: number;
        agentSessionKey?: string;
    }) => Promise<WikiGetResult | null>;
}
/**
 * Wiki search result (matches upstream WikiSearchResult pattern)
 */
export interface WikiSearchResult {
    corpus: 'wiki';
    path: string;
    title: string;
    kind: string;
    score: number;
    snippet: string;
    id?: string;
    startLine?: number;
    endLine?: number;
    sourceType?: string;
    provenanceMode?: string;
    sourcePath?: string;
    updatedAt?: string;
}
/**
 * Wiki get result (matches upstream WikiGetResult pattern)
 */
export interface WikiGetResult {
    corpus: 'wiki';
    path: string;
    title: string;
    kind: string;
    content: string;
    fromLine: number;
    lineCount: number;
    totalLines?: number;
    truncated?: boolean;
    id?: string;
    updatedAt?: string;
}
/**
 * Memory prompt section builder interface (matches upstream pattern)
 */
export type MemoryPromptSectionBuilder = (params: {
    availableTools: Set<string>;
}) => string[];
/**
 * Create wiki corpus supplement for memory host integration.
 *
 * Uses v2's TS implementation (wiki-store + wiki-graph).
 */
export declare function createWikiCorpusSupplement(params: {
    config: MemoryPluginConfig;
    appConfig?: unknown;
}): WikiCorpusSupplement;
/**
 * Create wiki prompt section builder for memory host integration.
 *
 * Generates wiki tool guidance and optional compiled digest.
 * Uses graph.json and GRAPH_REPORT.md for precise digest.
 */
export declare function createWikiPromptSectionBuilder(config: MemoryPluginConfig): MemoryPromptSectionBuilder;
//# sourceMappingURL=wiki-supplement.d.ts.map