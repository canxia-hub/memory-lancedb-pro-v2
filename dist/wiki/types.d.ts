/**
 * Wiki Type Contract (FROZEN)
 *
 * This file defines the public types for the Wiki subsystem within
 * memory-lancedb-pro-v2. These types MUST NOT be changed without
 * main-thread approval.
 *
 * Source: plans/graphify-integration-plan.md §6
 */
/**
 * Wiki entry categories.
 * Maps to directory names under wiki root.
 */
export type WikiCategory = 'concepts' | 'decisions' | 'procedures' | 'references' | 'snippets';
/**
 * Singular form aliases (for user-facing input).
 */
export type WikiCategorySingular = 'concept' | 'decision' | 'procedure' | 'reference' | 'snippet';
/**
 * Mapping from singular to plural form.
 */
export declare const CATEGORY_SINGULAR_TO_PLURAL: Record<WikiCategorySingular, WikiCategory>;
/**
 * All valid category directory names.
 */
export declare const WIKI_CATEGORIES: WikiCategory[];
/**
 * Wiki entry status.
 */
export type WikiEntryStatus = 'draft' | 'stable' | 'deprecated';
/**
 * Parsed YAML Front Matter structure.
 * Must be compatible with the Python wiki_common.py format.
 */
export interface WikiFrontMatter {
    /** Entry title */
    title: string;
    /** Entry category */
    category: WikiCategory;
    /** Tags for classification */
    tags: string[];
    /** Entry lifecycle status */
    status: WikiEntryStatus;
    /** Agent that created this entry */
    agent?: string;
    /** Confidence score (0-1) */
    confidence?: number;
    /** ISO 8601 creation timestamp */
    created?: string;
    /** ISO 8601 last update timestamp */
    updated?: string;
}
/**
 * A complete Wiki entry with parsed content.
 */
export interface WikiEntry {
    /** Path relative to wiki root */
    path: string;
    /** Parsed front matter */
    frontMatter: WikiFrontMatter;
    /** Content after front matter (body only) */
    content: string;
    /** Complete raw content including front matter */
    rawContent: string;
}
/**
 * Graph node types.
 */
export type WikiGraphNodeType = 'document' | 'section' | 'tag';
/**
 * A node in the Wiki knowledge graph.
 */
export interface WikiGraphNode {
    /** Unique node identifier (e.g., doc_slug, doc_slug_section_0, tag_name) */
    id: string;
    /** Human-readable label */
    label: string;
    /** Node type */
    nodeType: WikiGraphNodeType;
    /** Source Markdown file path */
    sourceFile: string;
    /** Source location (e.g., line number for sections) */
    sourceLocation?: string;
    /** Additional metadata */
    metadata: Record<string, unknown>;
}
/**
 * Edge relation types in the Wiki graph.
 */
export type WikiGraphRelation = 'contains' | 'tagged_with' | 'references' | 'relates_to' | 'depends_on' | 'extends' | 'contrasts_with' | 'backlink';
/**
 * Confidence source for graph edges.
 */
export type WikiGraphEdgeConfidence = 'EXTRACTED' | 'INFERRED';
/**
 * An edge in the Wiki knowledge graph.
 */
export interface WikiGraphEdge {
    /** Source node ID */
    source: string;
    /** Target node ID */
    target: string;
    /** Edge relation type */
    relation: WikiGraphRelation;
    /** How this edge was derived */
    confidence: WikiGraphEdgeConfidence;
    /** Numerical confidence score (0-1) */
    confidenceScore: number;
    /** Source Markdown file that defined this edge */
    sourceFile?: string;
    /** Additional metadata */
    metadata: Record<string, unknown>;
}
/**
 * Complete Wiki graph structure.
 * Compatible with graph.json output format.
 */
export interface WikiGraph {
    /** All nodes */
    nodes: WikiGraphNode[];
    /** All edges */
    edges: WikiGraphEdge[];
}
/**
 * Wiki health check result.
 */
export interface WikiHealthResult {
    /** Whether core files exist */
    coreFilesOk: boolean;
    /** Missing core files */
    missingFiles: string[];
    /** Number of broken wiki links */
    brokenLinkCount: number;
    /** Broken link details (limited to first 20) */
    brokenLinks: Array<{
        source: string;
        target: string;
    }>;
    /** Whether the graph is stale */
    graphStale: boolean;
    /** Reason if stale */
    graphStaleReason: string;
    /** Overall health status */
    healthy: boolean;
}
/**
 * Category index entry.
 */
export interface WikiIndexEntry {
    /** File name */
    file: string;
    /** Entry title */
    title: string;
    /** Tags */
    tags: string[];
    /** Status */
    status: WikiEntryStatus;
    /** Last updated timestamp */
    updated?: string;
    /** Agent */
    agent?: string;
}
/**
 * Category index.
 */
export interface WikiCategoryIndex {
    /** Category name */
    category: WikiCategory;
    /** Entries in this category */
    entries: WikiIndexEntry[];
}
/**
 * Wiki graph query result.
 */
export interface WikiQueryResult {
    /** Matched nodes with scores */
    matchedNodes: Array<{
        node: WikiGraphNode;
        score: number;
    }>;
    /** Related edges */
    relatedEdges: WikiGraphEdge[];
    /** Whether graph was stale at query time */
    graphWasStale: boolean;
}
//# sourceMappingURL=types.d.ts.map