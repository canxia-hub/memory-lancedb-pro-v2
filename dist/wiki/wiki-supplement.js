/**
 * Wiki Supplement - Batch B implementation
 *
 * Provides wiki corpus supplement and prompt supplement for memory-lancedb-pro-v2.
 * Integrates with existing v2 wiki capabilities (wiki-store, wiki-graph).
 *
 * Reference: upstream memory-wiki corpus-supplement.ts + prompt-section.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { listCategories, getEntry, WIKI_ROOT, } from './wiki-store.js';
import { queryGraph, } from './wiki-graph.js';
// ============================================================================
// Constants
// ============================================================================
const AGENT_DIGEST_PATH = '.openclaw-wiki/cache/agent-digest.json';
const DIGEST_MAX_PAGES = 4;
const DIGEST_MAX_CLAIMS_PER_PAGE = 2;
// ============================================================================
// Wiki Corpus Supplement
// ============================================================================
/**
 * Create wiki corpus supplement for memory host integration.
 *
 * Uses v2's TS implementation (wiki-store + wiki-graph).
 */
export function createWikiCorpusSupplement(params) {
    const vaultPath = params.config.vault?.path || WIKI_ROOT;
    return {
        /**
         * Search wiki pages by query.
         *
         * Uses TS implementation (wiki-graph queryGraph + wiki-store entry iteration).
         */
        search: async (input) => {
            const maxResults = Math.max(1, input.maxResults ?? 10);
            const results = [];
            // 1. Query graph using TS implementation
            const graphPath = path.join(vaultPath, 'graphify-out', 'graph.json');
            if (fs.existsSync(graphPath) && results.length < maxResults) {
                try {
                    const graphResult = await queryGraph(input.query, graphPath);
                    for (const { node, score } of graphResult.matchedNodes.slice(0, maxResults - results.length)) {
                        // Skip if already in results
                        if (results.some(r => r.title === node.label))
                            continue;
                        let snippet = node.label;
                        let kind = node.nodeType || 'document';
                        let updatedAt;
                        if (node.sourceFile) {
                            const entry = getEntry(path.relative(vaultPath, node.sourceFile));
                            if (entry) {
                                snippet = buildSnippet(entry.rawContent, input.query);
                                kind = entry.frontMatter.category;
                                updatedAt = entry.frontMatter.updated;
                            }
                        }
                        results.push({
                            corpus: 'wiki',
                            path: node.sourceFile ? path.relative(vaultPath, node.sourceFile) : node.id,
                            title: node.label,
                            kind,
                            score,
                            snippet,
                            id: node.id,
                            updatedAt,
                        });
                    }
                }
                catch {
                    // Graph query failed, continue to entry iteration
                }
            }
            // 2. Final fallback: entry iteration (basic keyword matching)
            if (results.length < maxResults) {
                const categories = listCategories();
                for (const [category, count] of Object.entries(categories)) {
                    if (count === 0)
                        continue;
                    const categoryPath = path.join(vaultPath, category);
                    if (!fs.existsSync(categoryPath))
                        continue;
                    const files = fs.readdirSync(categoryPath)
                        .filter(f => f.endsWith('.md') && !f.startsWith('_'));
                    for (const file of files) {
                        const relativePath = path.join(category, file);
                        const entry = getEntry(relativePath);
                        if (!entry)
                            continue;
                        // Skip if already in results
                        if (results.some(r => r.path === relativePath))
                            continue;
                        // Simple keyword matching
                        const queryLower = input.query.toLowerCase();
                        const titleLower = entry.frontMatter.title.toLowerCase();
                        const contentLower = entry.content.toLowerCase();
                        let score = 0;
                        if (titleLower.includes(queryLower)) {
                            score += 20;
                        }
                        if (contentLower.includes(queryLower)) {
                            score += 5;
                        }
                        if (score > 0) {
                            results.push({
                                corpus: 'wiki',
                                path: relativePath,
                                title: entry.frontMatter.title,
                                kind: entry.frontMatter.category,
                                score,
                                snippet: buildSnippet(entry.rawContent, input.query),
                                updatedAt: entry.frontMatter.updated,
                            });
                        }
                    }
                }
            }
            // Sort by score and limit
            results.sort((a, b) => b.score - a.score);
            return results.slice(0, maxResults);
        },
        /**
         * Get wiki page by lookup (path, title, or id).
         *
         * Uses wiki-store getEntry for direct path lookup.
         * Uses wiki-store getEntry for direct path lookup.
         */
        get: async (input) => {
            const fromLine = Math.max(1, input.fromLine ?? 1);
            const lineCount = Math.max(1, input.lineCount ?? 200);
            // Normalize lookup key
            let relativePath = input.lookup.trim().replace(/\\/g, '/');
            if (!relativePath.endsWith('.md')) {
                relativePath += '.md';
            }
            // Try direct path lookup
            const entry = getEntry(relativePath);
            if (!entry) {
                // Try with category prefix if not found
                const categories = ['concepts', 'decisions', 'procedures', 'references', 'snippets'];
                for (const cat of categories) {
                    const tryPath = path.join(cat, relativePath);
                    const tryEntry = getEntry(tryPath);
                    if (tryEntry) {
                        return buildGetResult(tryEntry, fromLine, lineCount);
                    }
                }
                // Fallback: return null if entry not found
                return null;
            }
            return buildGetResult(entry, fromLine, lineCount);
        },
    };
}
/**
 * Build snippet from content matching query.
 */
function buildSnippet(rawContent, query) {
    const queryLower = query.toLowerCase();
    const lines = rawContent.split('\n');
    const matchingLine = lines.find(line => line.toLowerCase().includes(queryLower) && line.trim().length > 0);
    return matchingLine?.trim() || lines.find(l => l.trim().length > 0)?.trim() || '';
}
/**
 * Build WikiGetResult from WikiEntry.
 */
function buildGetResult(entry, fromLine, lineCount) {
    const lines = entry.rawContent.split('\n');
    const totalLines = lines.length;
    const slice = lines.slice(fromLine - 1, fromLine - 1 + lineCount).join('\n');
    const truncated = fromLine - 1 + lineCount < totalLines;
    return {
        corpus: 'wiki',
        path: entry.path,
        title: entry.frontMatter.title,
        kind: entry.frontMatter.category,
        content: slice,
        fromLine,
        lineCount,
        totalLines,
        truncated,
        updatedAt: entry.frontMatter.updated,
    };
}
// ============================================================================
// Wiki Prompt Section Builder
// ============================================================================
/**
 * Create wiki prompt section builder for memory host integration.
 *
 * Generates wiki tool guidance and optional compiled digest.
 * Uses graph.json and GRAPH_REPORT.md for precise digest.
 */
export function createWikiPromptSectionBuilder(config) {
    const vaultPath = config.vault?.path || WIKI_ROOT;
    const includeDigest = config.context?.includeCompiledDigestPrompt ?? false;
    return ({ availableTools }) => {
        const digestLines = includeDigest ? buildDigestPromptSection(vaultPath) : [];
        const toolGuidance = buildWikiToolGuidance(availableTools);
        if (digestLines.length === 0 && toolGuidance.length === 0) {
            return [];
        }
        return [...toolGuidance, ...digestLines];
    };
}
/**
 * Try read prompt digest (gracefully returns null if file doesn't exist).
 */
function tryReadPromptDigest(vaultPath) {
    const digestPath = path.join(vaultPath, AGENT_DIGEST_PATH);
    // Graceful: return null if file doesn't exist
    if (!fs.existsSync(digestPath)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(digestPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return parsed;
    }
    catch {
        // Graceful: return null on parse error
        return null;
    }
}
/**
 * Rank digest page for sorting.
 */
function rankPromptDigestPage(page) {
    return ((page.contradictions?.length ?? 0) * 6 +
        (page.questions?.length ?? 0) * 4 +
        Math.min(page.claimCount ?? 0, 6) * 2 +
        Math.min(page.topClaims?.length ?? 0, 3));
}
/**
 * Rank claim freshness for sorting.
 */
function rankPromptClaimFreshness(level) {
    switch (level) {
        case 'fresh':
            return 3;
        case 'aging':
            return 2;
        case 'stale':
            return 1;
        default:
            return 0;
    }
}
/**
 * Sort claims by confidence and freshness.
 */
function sortPromptClaims(claims) {
    return [...claims].sort((left, right) => {
        const leftConfidence = typeof left.confidence === 'number' ? left.confidence : -1;
        const rightConfidence = typeof right.confidence === 'number' ? right.confidence : -1;
        if (leftConfidence !== rightConfidence) {
            return rightConfidence - leftConfidence;
        }
        const leftFreshness = rankPromptClaimFreshness(left.freshnessLevel);
        const rightFreshness = rankPromptClaimFreshness(right.freshnessLevel);
        if (leftFreshness !== rightFreshness) {
            return rightFreshness - leftFreshness;
        }
        return left.text.localeCompare(right.text);
    });
}
/**
 * Format claim with qualifiers.
 */
function formatPromptClaim(claim) {
    const qualifiers = [
        claim.status?.trim() ? `status ${claim.status.trim()}` : null,
        typeof claim.confidence === 'number' ? `confidence ${claim.confidence.toFixed(2)}` : null,
        claim.freshnessLevel?.trim() ? `freshness ${claim.freshnessLevel.trim()}` : null,
    ].filter(Boolean);
    if (qualifiers.length === 0) {
        return claim.text;
    }
    return `${claim.text} (${qualifiers.join(', ')})`;
}
/**
 * Build digest prompt section from compiled agent-digest.
 *
 * Priority: graph.json + GRAPH_REPORT.md -> existing digest file.
 */
function buildDigestPromptSection(vaultPath) {
    // Use existing prompt digest file
    const digest = tryReadPromptDigest(vaultPath);
    // Graceful: return empty array if digest doesn't exist
    if (!digest?.pages?.length) {
        return [];
    }
    const selectedPages = [...digest.pages]
        .filter((page) => (page.claimCount ?? 0) > 0 ||
        (page.questions?.length ?? 0) > 0 ||
        (page.contradictions?.length ?? 0) > 0)
        .sort((left, right) => {
        const leftScore = rankPromptDigestPage(left);
        const rightScore = rankPromptDigestPage(right);
        if (leftScore !== rightScore) {
            return rightScore - leftScore;
        }
        return left.title.localeCompare(right.title);
    })
        .slice(0, DIGEST_MAX_PAGES);
    if (selectedPages.length === 0) {
        return [];
    }
    const lines = [
        '## Compiled Wiki Snapshot',
        `Compiled wiki currently tracks ${digest.claimCount ?? 0} claims across ${selectedPages.length} high-signal pages.`,
    ];
    if (Array.isArray(digest.contradictionClusters)) {
        lines.push(`Contradiction clusters: ${digest.contradictionClusters.length}.`);
    }
    for (const page of selectedPages) {
        const details = [
            page.kind,
            `${page.claimCount} claims`,
            (page.questions?.length ?? 0) > 0 ? `${page.questions?.length} open questions` : null,
            (page.contradictions?.length ?? 0) > 0
                ? `${page.contradictions?.length} contradiction notes`
                : null,
        ].filter(Boolean);
        lines.push(`- ${page.title}: ${details.join(', ')}`);
        for (const claim of sortPromptClaims(page.topClaims ?? []).slice(0, DIGEST_MAX_CLAIMS_PER_PAGE)) {
            lines.push(`  - ${formatPromptClaim(claim)}`);
        }
    }
    lines.push('');
    return lines;
}
/**
 * Build wiki tool guidance based on available tools.
 */
function buildWikiToolGuidance(availableTools) {
    const hasWikiSearch = availableTools.has('wiki_search');
    const hasWikiGet = availableTools.has('wiki_get');
    const hasWikiQuery = availableTools.has('wiki_query');
    const hasWikiBuild = availableTools.has('wiki_build');
    const hasWikiDoctor = availableTools.has('wiki_doctor');
    const hasMemoryRecall = availableTools.has('memory_recall');
    if (!hasWikiSearch &&
        !hasWikiGet &&
        !hasWikiQuery &&
        !hasWikiBuild &&
        !hasWikiDoctor &&
        !hasMemoryRecall) {
        return [];
    }
    const lines = [
        '## Compiled Wiki',
        'Use the wiki when the answer depends on accumulated project knowledge, prior syntheses, entity pages, or source-backed notes that should survive beyond one conversation.',
    ];
    if (hasMemoryRecall) {
        lines.push('Use `memory_recall` to retrieve stored preferences, facts, and decisions from long-term memory.');
    }
    if (hasWikiSearch && hasWikiGet) {
        lines.push('Workflow: `wiki_search` first, then `wiki_get` for the exact page you need. Use this when you want wiki-specific ranking or provenance details.');
    }
    else if (hasWikiSearch) {
        lines.push('Use `wiki_search` before answering from stored knowledge when you want wiki-specific ranking.');
    }
    else if (hasWikiGet) {
        lines.push('Use `wiki_get` to inspect specific wiki pages by path/id.');
    }
    if (hasWikiQuery) {
        lines.push('Use `wiki_query` to search the wiki knowledge graph for structured relationship queries.');
    }
    if (hasWikiBuild) {
        lines.push('Use `wiki_build` to rebuild the knowledge graph after significant wiki updates.');
    }
    if (hasWikiDoctor) {
        lines.push('After meaningful wiki updates, run `wiki_doctor` to check vault health before trusting the graph.');
    }
    lines.push('');
    return lines;
}
// ============================================================================
// Exports
// ============================================================================
// Note: WikiSearchResult and WikiGetResult are already exported as interfaces above.
// No need to re-export them here.
//# sourceMappingURL=wiki-supplement.js.map