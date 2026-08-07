/**
 * Wiki Tools - TypeScript Native Implementation
 *
 * Wiki 工具注册与接线，直接调用 TypeScript 实现。
 */
// W1/W2 导入 (已落地)
import { CATEGORY_SINGULAR_TO_PLURAL, } from '../wiki/types.js';
import { listCategories, getEntry, createEntry, } from '../wiki/wiki-store.js';
import { checkWikiHealth, analyzeGraphQuality, } from '../wiki/wiki-doctor.js';
import { buildAllIndexes, updateMainIndex, } from '../wiki/wiki-index.js';
import { syncBacklinks, } from '../wiki/wiki-sync-links.js';
// W3 导入 (契约已冻结，按签名导入)
import { queryGraph, buildWikiGraph, } from '../wiki/wiki-graph.js';
// M6 导入 (digest compiler)
import { compileDigest, ensureDigest, } from '../wiki/digest-compiler.js';
// P1 导入 (wiki vector index)
import { indexWikiPages, getWikiIndexStatus, searchWikiVector, } from '../wiki/wiki-vector-index.js';
// M1 导入 (graph traversal)
import { traverseGraph, findGraphPath, } from '../wiki/wiki-traverse.js';
// M3 导入 (hybrid search)
import { hybridWikiSearch, } from '../wiki/wiki-hybrid.js';
// ============================================================================
// Config bridge (set by register.js to avoid circular dependency)
// ============================================================================
let _getPluginConfig = null;
export function setWikiToolConfigGetter(getter) {
    _getPluginConfig = getter;
}
// ============================================================================
// Wiki Status Tool
// ============================================================================
const wikiStatusSchema = {
    type: "object",
    properties: {},
};
function createWikiStatusTool() {
    return {
        name: "wiki_status",
        description: "Inspect the current memory wiki vault mode, health, and Obsidian CLI availability.",
        parameters: wikiStatusSchema,
        execute: async () => {
            const categories = listCategories();
            const healthResult = await checkWikiHealth();
            // M2: vector index coverage
            let vectorIndex;
            try {
                const config = _getPluginConfig?.();
                vectorIndex = config ? await getWikiIndexStatus(config) : { available: false, reason: 'config not available' };
            }
            catch (e) {
                vectorIndex = { available: false, error: String(e) };
            }
            const result = {
                categories,
                health: {
                    coreFilesOk: healthResult.coreFilesOk,
                    brokenLinkCount: healthResult.brokenLinkCount,
                    graphStale: healthResult.graphStale,
                    healthy: healthResult.healthy,
                },
                vectorIndex,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki New Tool
// ============================================================================
const wikiNewSchema = {
    type: "object",
    properties: {
        category: {
            type: "string",
            description: "Wiki category (supports singular/plural forms: concept/concepts, decision/decisions, etc.)",
        },
        title: {
            type: "string",
            description: "Entry title",
        },
        tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for classification",
        },
        status: {
            type: "string",
            enum: ["draft", "stable", "deprecated"],
            description: "Entry lifecycle status (default: draft)",
        },
    },
    required: ["category", "title"],
};
function createWikiNewTool() {
    return {
        name: "wiki_new",
        description: "Create a new Wiki entry with front matter. Supports singular/plural category names.",
        parameters: wikiNewSchema,
        execute: async (params) => {
            const input = params;
            // Normalize category (support singular/plural)
            let normalizedCategory;
            const categoryLower = input.category.toLowerCase();
            if (CATEGORY_SINGULAR_TO_PLURAL[categoryLower]) {
                normalizedCategory = CATEGORY_SINGULAR_TO_PLURAL[categoryLower];
            }
            else {
                normalizedCategory = categoryLower;
            }
            // Create entry
            const relativePath = await createEntry(normalizedCategory, input.title, {
                tags: input.tags || [],
                status: input.status || "draft",
            });
            // Trigger sync + index
            await syncBacklinks();
            await buildAllIndexes();
            await updateMainIndex();
            const result = {
                path: relativePath,
                message: `Wiki entry created: ${relativePath}`,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Get Tool
// ============================================================================
const wikiGetSchema = {
    type: "object",
    properties: {
        lookup: {
            type: "string",
            description: "Wiki entry path or lookup term",
        },
    },
    required: ["lookup"],
};
function createWikiGetTool() {
    return {
        name: "wiki_get",
        description: "Read a local wiki entry by relative path or lookup term from the current wiki vault.",
        parameters: wikiGetSchema,
        execute: async (params) => {
            const input = params;
            const entry = getEntry(input.lookup);
            const result = {
                entry,
                found: entry !== null,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Query Tool
// ============================================================================
const wikiQuerySchema = {
    type: "object",
    properties: {
        query: {
            type: "string",
            description: "Search query text",
        },
        maxResults: {
            type: "number",
            minimum: 1,
            description: "Maximum number of results (default: 10)",
        },
        mode: {
            type: "string",
            enum: ["keyword", "vector", "hybrid"],
            description: "Search mode: keyword (graph keyword scoring), vector (semantic), hybrid (keyword+vector fused, default)",
        },
        keywordWeight: {
            type: "number",
            description: "Hybrid fusion keyword weight (default: 0.5)",
        },
        vectorWeight: {
            type: "number",
            description: "Hybrid fusion vector weight (default: 0.5)",
        },
        expandGraph: {
            type: "boolean",
            description: "Include 1-hop references neighborhood for top results (default: false)",
        },
    },
    required: ["query"],
};
function createWikiQueryTool() {
    return {
        name: "wiki_query",
        description: "Query the Wiki knowledge base. mode=keyword: graph keyword scoring; mode=vector: semantic search; mode=hybrid (default): keyword+vector fused ranking with optional graph expansion.",
        parameters: wikiQuerySchema,
        execute: async (params) => {
            const input = params;
            const maxResults = input.maxResults || 10;
            const mode = input.mode || 'hybrid';
            // --- vector mode: pure semantic ---
            if (mode === 'vector') {
                const config = _getPluginConfig?.();
                if (!config) {
                    const err = { error: 'plugin config not available', results: [] };
                    return {
                        content: [{ type: "text", text: JSON.stringify(err, null, 2) }],
                        details: err,
                    };
                }
                const results = await searchWikiVector(config, input.query, { maxResults });
                const result = { query: input.query, mode, totalResults: results.length, results, source: 'typescript' };
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                    details: result,
                };
            }
            // --- hybrid mode: keyword + vector fused ---
            if (mode === 'hybrid') {
                const config = _getPluginConfig?.();
                const result = await hybridWikiSearch(config ?? null, input.query, {
                    maxResults,
                    keywordWeight: input.keywordWeight,
                    vectorWeight: input.vectorWeight,
                    expandGraph: input.expandGraph,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                    details: result,
                };
            }
            // --- keyword mode: legacy behavior (unchanged) ---
            const queryResult = await queryGraph(input.query);
            const limitedNodes = queryResult.matchedNodes.slice(0, maxResults);
            const result = {
                matchedNodes: limitedNodes.map(m => ({
                    node: {
                        id: m.node.id,
                        label: m.node.label,
                        nodeType: m.node.nodeType,
                    },
                    score: m.score,
                })),
                relatedEdges: queryResult.relatedEdges.slice(0, maxResults * 2).map(e => ({
                    source: e.source,
                    target: e.target,
                    relation: e.relation,
                })),
                graphWasStale: queryResult.graphWasStale,
                totalMatches: queryResult.matchedNodes.length,
                mode: 'keyword',
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Build Tool
// ============================================================================
const wikiBuildSchema = {
    type: "object",
    properties: {
        semantic: {
            type: "boolean",
            description: "Enable semantic edge inference (optional)",
        },
        model: {
            type: "string",
            description: "LLM model for semantic inference (optional)",
        },
        force: {
            type: "boolean",
            description: "Force full rebuild instead of incremental (default: false)",
        },
    },
};
function createWikiBuildTool() {
    return {
        name: "wiki_build",
        description: "Build the Wiki knowledge graph from Markdown entries. semantic=true currently degrades gracefully when semantic inference is unavailable.",
        parameters: wikiBuildSchema,
        execute: async (params) => {
            const input = params;
            // Call TS buildWikiGraph (incremental by default, force=true for full)
            const buildResult = await buildWikiGraph({
                force: input.force ?? false,
                semantic: input.semantic,
                model: input.model,
            });
            // M6: Auto-compile digest after graph build
            let digestResult;
            try {
                const digest = compileDigest({ force: true });
                digestResult = {
                    claimCount: digest.claimCount,
                    pagesInDigest: digest.pages.length,
                    compiledAt: digest.compiledAt,
                };
            } catch (e) {
                digestResult = { error: String(e) };
            }
            // P1: Update vector index after graph build
            let vectorIndexResult;
            try {
                const config = _getPluginConfig?.();
                if (config) {
                    const vaultPath = config.vault?.path;
                    if (vaultPath) {
                        vectorIndexResult = await indexWikiPages(config, vaultPath, { force: true });
                    } else {
                        vectorIndexResult = { skipped: true, reason: 'no vault path' };
                    }
                } else {
                    vectorIndexResult = { skipped: true, reason: 'config not available' };
                }
            } catch (e) {
                vectorIndexResult = { error: String(e) };
            }
            const result = {
                graphPath: buildResult.graphPath,
                reportPath: buildResult.reportPath,
                htmlPath: buildResult.htmlPath,
                totalNodes: buildResult.analysis.totalNodes,
                totalEdges: buildResult.analysis.totalEdges,
                semanticEdges: buildResult.analysis.semanticEdges,
                llmEnabled: input.semantic ?? false,
                incremental: buildResult.incremental ?? false,
                skipped: buildResult.skipped ?? false,
                changes: buildResult.changes ?? null,
                digest: digestResult,
                vectorIndex: vectorIndexResult,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Doctor Tool
// ============================================================================
const wikiDoctorSchema = {
    type: "object",
    properties: {},
};
function createWikiDoctorTool() {
    return {
        name: "wiki_doctor",
        description: "Lint the wiki vault and surface structural issues, provenance gaps, contradictions, and open questions.",
        parameters: wikiDoctorSchema,
        execute: async () => {
            const healthResult = await checkWikiHealth();
            // M4: graph quality analysis (references-dimension connectivity)
            let graphQuality;
            try {
                graphQuality = await analyzeGraphQuality();
            }
            catch (e) {
                graphQuality = { available: false, error: String(e) };
            }
            const result = {
                healthy: healthResult.healthy,
                coreFilesOk: healthResult.coreFilesOk,
                missingFiles: healthResult.missingFiles,
                brokenLinkCount: healthResult.brokenLinkCount,
                brokenLinks: healthResult.brokenLinks,
                graphStale: healthResult.graphStale,
                graphStaleReason: healthResult.graphStaleReason,
                graphQuality,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Index Tool
// ============================================================================
const wikiIndexSchema = {
    type: "object",
    properties: {},
};
function createWikiIndexTool() {
    return {
        name: "wiki_index",
        description: "Rebuild category indexes and main INDEX.md for Wiki vault.",
        parameters: wikiIndexSchema,
        execute: async () => {
            await buildAllIndexes();
            await updateMainIndex();
            // M6: Ensure digest is fresh after index rebuild
            let digestResult;
            try {
                const digest = ensureDigest({ force: false });
                digestResult = {
                    claimCount: digest.claimCount,
                    pagesInDigest: digest.pages.length,
                };
            } catch (e) {
                digestResult = { error: String(e) };
            }
            // Count number of category indexes (5 categories)
            const indexesUpdated = 5 + 1; // 5 category indexes + 1 main index
            const result = {
                message: "All Wiki indexes rebuilt",
                indexesUpdated,
                digest: digestResult,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Sync Links Tool
// ============================================================================
const wikiSyncLinksSchema = {
    type: "object",
    properties: {},
};
function createWikiSyncLinksTool() {
    return {
        name: "wiki_sync_links",
        description: "Synchronize backlinks across all Wiki entries.",
        parameters: wikiSyncLinksSchema,
        execute: async () => {
            const documentsUpdated = await syncBacklinks();
            const result = {
                message: "Wiki backlinks synchronized",
                documentsUpdated,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Traverse Tool (M1)
// ============================================================================
const wikiTraverseSchema = {
    type: "object",
    properties: {
        start: {
            type: "string",
            description: "Start node: exact id or label (fuzzy matched)",
        },
        depth: {
            type: "number",
            description: "Expansion depth 1-3 (default: 2)",
        },
        direction: {
            type: "string",
            enum: ["outgoing", "incoming", "both"],
            description: "Edge direction filter (default: both)",
        },
        edgeTypes: {
            type: "array",
            items: { type: "string" },
            description: "Edge relation filter: contains/tagged_with/references (default: all)",
        },
        maxNodes: {
            type: "number",
            description: "Max nodes to return (default: 50, hard cap 200)",
        },
    },
    required: ["start"],
};
function createWikiTraverseTool() {
    return {
        name: "wiki_traverse",
        description: "Traverse the Wiki knowledge graph from a start node via N-hop BFS expansion. Supports depth/direction/edge-type filters. Use for exploring relationships around an entry.",
        parameters: wikiTraverseSchema,
        execute: async (params) => {
            const input = params;
            const result = await traverseGraph({
                start: input.start,
                depth: input.depth,
                direction: input.direction,
                edgeTypes: input.edgeTypes,
                maxNodes: input.maxNodes,
            });
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Path Tool (M1)
// ============================================================================
const wikiPathSchema = {
    type: "object",
    properties: {
        from: {
            type: "string",
            description: "Start node: exact id or label (fuzzy matched)",
        },
        to: {
            type: "string",
            description: "Target node: exact id or label (fuzzy matched)",
        },
        maxDepth: {
            type: "number",
            description: "Max search depth (default: 5, hard cap 8)",
        },
        edgeTypes: {
            type: "array",
            items: { type: "string" },
            description: "Edge relation filter: contains/tagged_with/references (default: all)",
        },
    },
    required: ["from", "to"],
};
function createWikiPathTool() {
    return {
        name: "wiki_path",
        description: "Find the shortest path between two Wiki entries in the knowledge graph (BFS). Returns the node chain and edges, or unreachable within maxDepth.",
        parameters: wikiPathSchema,
        execute: async (params) => {
            const input = params;
            const result = await findGraphPath({
                from: input.from,
                to: input.to,
                maxDepth: input.maxDepth,
                edgeTypes: input.edgeTypes,
            });
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Wiki Search Tool (M2 - vector channel)
// ============================================================================
const wikiSearchSchema = {
    type: "object",
    properties: {
        query: {
            type: "string",
            description: "Semantic search query text",
        },
        maxResults: {
            type: "number",
            description: "Max results (default: 10)",
        },
        minScore: {
            type: "number",
            description: "Minimum similarity score 0-1 (default: 0.1)",
        },
        category: {
            type: "string",
            description: "Category filter (concepts/decisions/procedures/references/snippets)",
        },
    },
    required: ["query"],
};
function createWikiSearchTool() {
    return {
        name: "wiki_search",
        description: "Semantic vector search over Wiki pages (LanceDB wiki_pages table). Complements wiki_query (keyword) with embedding similarity.",
        parameters: wikiSearchSchema,
        execute: async (params) => {
            const input = params;
            const config = _getPluginConfig?.();
            if (!config) {
                const err = { error: 'plugin config not available', results: [] };
                return {
                    content: [{ type: "text", text: JSON.stringify(err, null, 2) }],
                    details: err,
                };
            }
            const results = await searchWikiVector(config, input.query, {
                maxResults: input.maxResults,
                minScore: input.minScore,
                category: input.category,
            });
            const result = {
                query: input.query,
                totalResults: results.length,
                results,
                source: 'typescript',
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
            };
        },
    };
}
// ============================================================================
// Registration Function
// ============================================================================
/**
 * Register all Wiki tools with OpenClaw.
 *
 * @param registerTool - OpenClaw registerTool function
 */
export function registerAllWikiTools(registerTool) {
    registerTool(createWikiStatusTool());
    registerTool(createWikiNewTool());
    registerTool(createWikiGetTool());
    registerTool(createWikiQueryTool());
    registerTool(createWikiBuildTool());
    registerTool(createWikiDoctorTool());
    registerTool(createWikiIndexTool());
    registerTool(createWikiSyncLinksTool());
    // M1/M2
    registerTool(createWikiTraverseTool());
    registerTool(createWikiPathTool());
    registerTool(createWikiSearchTool());
}
//# sourceMappingURL=wiki-tools.js.map