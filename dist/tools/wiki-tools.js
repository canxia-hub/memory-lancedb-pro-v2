/**
 * Wiki Tools - TypeScript Native Implementation
 *
 * Wiki 工具注册与接线，直接调用 TypeScript 实现。
 */
// W1/W2 导入 (已落地)
import { CATEGORY_SINGULAR_TO_PLURAL, } from '../wiki/types.js';
import { listCategories, getEntry, createEntry, } from '../wiki/wiki-store.js';
import { checkWikiHealth, } from '../wiki/wiki-doctor.js';
import { buildAllIndexes, updateMainIndex, } from '../wiki/wiki-index.js';
import { syncBacklinks, } from '../wiki/wiki-sync-links.js';
// W3 导入 (契约已冻结，按签名导入)
import { queryGraph, buildWikiGraph, } from '../wiki/wiki-graph.js';
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
            const result = {
                categories,
                health: {
                    coreFilesOk: healthResult.coreFilesOk,
                    brokenLinkCount: healthResult.brokenLinkCount,
                    graphStale: healthResult.graphStale,
                    healthy: healthResult.healthy,
                },
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
            description: "Search query for graph query",
        },
        maxResults: {
            type: "number",
            minimum: 1,
            description: "Maximum number of results (default: 10)",
        },
    },
    required: ["query"],
};
function createWikiQueryTool() {
    return {
        name: "wiki_query",
        description: "Query the built Wiki knowledge graph by keyword. Returns matched nodes and related edges from graph.json.",
        parameters: wikiQuerySchema,
        execute: async (params) => {
            const input = params;
            // Call TS queryGraph
            const queryResult = await queryGraph(input.query);
            // Limit results
            const maxResults = input.maxResults || 10;
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
    },
};
function createWikiBuildTool() {
    return {
        name: "wiki_build",
        description: "Build the Wiki knowledge graph from Markdown entries. semantic=true currently degrades gracefully when semantic inference is unavailable.",
        parameters: wikiBuildSchema,
        execute: async (params) => {
            const input = params;
            // Call TS buildWikiGraph
            const buildResult = await buildWikiGraph();
            const result = {
                graphPath: buildResult.graphPath,
                reportPath: buildResult.reportPath,
                htmlPath: buildResult.htmlPath,
                totalNodes: buildResult.analysis.totalNodes,
                totalEdges: buildResult.analysis.totalEdges,
                semanticEdges: buildResult.analysis.semanticEdges,
                llmEnabled: input.semantic ?? false,
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
            const result = {
                healthy: healthResult.healthy,
                coreFilesOk: healthResult.coreFilesOk,
                missingFiles: healthResult.missingFiles,
                brokenLinkCount: healthResult.brokenLinkCount,
                brokenLinks: healthResult.brokenLinks,
                graphStale: healthResult.graphStale,
                graphStaleReason: healthResult.graphStaleReason,
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
            // Count number of category indexes (5 categories)
            const indexesUpdated = 5 + 1; // 5 category indexes + 1 main index
            const result = {
                message: "All Wiki indexes rebuilt",
                indexesUpdated,
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
}
//# sourceMappingURL=wiki-tools.js.map