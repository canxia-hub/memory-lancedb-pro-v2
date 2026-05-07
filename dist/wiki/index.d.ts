/**
 * Wiki Module - Phase W1 + W2 + W3 + Batch B 实现
 *
 * 提供Wiki 数据存取、索引生成、反向链接同步、健康检查和图谱构建功能
 * Batch B: 新增 corpus supplement + prompt supplement 导出
 */
export * from './types.js';
export { WIKI_ROOT, slugify, normalizeLinkTarget, resolveLinkToPath, parseFrontMatter, serializeFrontMatter, listCategories, getEntry, createEntry, updateEntry, deleteEntry, } from './wiki-store.js';
export { checkWikiHealth, formatHealthReport, } from './wiki-doctor.js';
export { buildCategoryIndex, buildAllIndexes, buildTagIndex, updateMainIndex, } from './wiki-index.js';
export { extractWikiLinks, syncBacklinks, } from './wiki-sync-links.js';
export { extractFrontMatter, extractHeadings, extractLinks, extractTags, extractFile, extractWiki, } from './wiki-extractor.js';
export type { ExtractedWikiFile, WikiExtractionResult, } from './wiki-extractor.js';
export { loadGraph, queryGraph, buildWikiGraph, analyzeGraph, generateGraphReport, } from './wiki-graph.js';
export type { WikiGraphAnalysis, WikiBuildResult, } from './wiki-graph.js';
export { createWikiCorpusSupplement, createWikiPromptSectionBuilder, WikiCorpusSupplement, MemoryPromptSectionBuilder, } from './wiki-supplement.js';
export type { WikiSearchResult, WikiGetResult, } from './wiki-supplement.js';
//# sourceMappingURL=index.d.ts.map