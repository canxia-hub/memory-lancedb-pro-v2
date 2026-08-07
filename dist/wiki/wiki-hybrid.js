/**
 * Wiki Hybrid Search - 混合检索融合模块（M3）
 *
 * 三通道融合：
 *   A. keyword  — queryGraph 关键词打分（label/category/status/agent）
 *   B. vector   — searchWikiVector 语义相似度（wiki_pages 向量表）
 *   C. graph    — expandGraph 可选：top 命中文档的 references 邻域（上下文补充，不参与排序）
 *
 * 粒度对齐：图节点（document/section/tag）聚合到文档维度，与向量页按相对路径对齐。
 * 退化保证：向量通道不可用（embedding 失败/表空）时自动退化为纯关键词排序。
 */
import { queryGraph, } from './wiki-graph.js';
import { searchWikiVector, } from './wiki-vector-index.js';
import { loadGraphCached, traverseGraph, } from './wiki-traverse.js';
// ============================================================================
// Path Alignment Helpers
// ============================================================================
/** 绝对 sourceFile → vault 相对路径（统一正斜杠）。对齐向量页 path 格式。 */
function toRelPath(sourceFile, wikiRoot) {
    if (!sourceFile)
        return null;
    const norm = String(sourceFile).replace(/\\/g, '/');
    const rootNorm = String(wikiRoot).replace(/\\/g, '/');
    if (norm.toLowerCase().startsWith(rootNorm.toLowerCase() + '/')) {
        return norm.slice(rootNorm.length + 1);
    }
    // fallback: 取 wiki/ 之后的部分
    const idx = norm.toLowerCase().indexOf('/wiki/');
    return idx >= 0 ? norm.slice(idx + 6) : norm;
}
/** section id → 父文档 id（doc_xxx_section_N → doc_xxx） */
function parentDocId(sectionId) {
    const idx = String(sectionId).lastIndexOf('_section_');
    return idx > 0 ? String(sectionId).slice(0, idx) : null;
}
// ============================================================================
// Keyword Channel Aggregation (document-level)
// ============================================================================
/**
 * 把 queryGraph 的节点级命中聚合到文档维度。
 * @returns {Map<string, {docId, label, relPath, category, keywordScore, matchedNodes: Array}>}
 */
function aggregateKeywordHits(queryResult, graph, wikiRoot) {
    const docMap = new Map();
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
    const maxRaw = Math.max(1, ...queryResult.matchedNodes.map(m => m.score));
    const addHit = (docNode, rawScore, viaNode) => {
        if (!docNode)
            return;
        const relPath = toRelPath(docNode.sourceFile, wikiRoot);
        if (!relPath)
            return;
        const normScore = rawScore / maxRaw; // 归一化到 0-1
        const existing = docMap.get(relPath);
        if (existing) {
            existing.keywordScore = Math.max(existing.keywordScore, normScore);
            existing.matchedNodes.push(viaNode);
        }
        else {
            docMap.set(relPath, {
                docId: docNode.id,
                label: docNode.label,
                relPath,
                category: docNode.metadata?.category,
                keywordScore: normScore,
                vectorScore: 0,
                matchedNodes: [viaNode],
            });
        }
    };
    for (const m of queryResult.matchedNodes) {
        const node = m.node;
        if (node.nodeType === 'document') {
            addHit(node, m.score, { id: node.id, label: node.label, nodeType: 'document', score: m.score });
        }
        else if (node.nodeType === 'section') {
            const pid = parentDocId(node.id);
            addHit(nodeById.get(pid), m.score, { id: node.id, label: node.label, nodeType: 'section', score: m.score });
        }
        else if (node.nodeType === 'tag') {
            // tag 命中 → tagged_with 反查文档（半分权重）
            for (const e of queryResult.relatedEdges) {
                if ((e.relation === 'tagged_with') && e.target === node.id) {
                    addHit(nodeById.get(e.source), m.score * 0.5, { id: node.id, label: node.label, nodeType: 'tag', score: m.score });
                }
            }
        }
    }
    return docMap;
}
// ============================================================================
// Hybrid Search
// ============================================================================
/**
 * 混合检索主入口
 *
 * @param {object|null} config - 插件 config（向量通道需要；null 时退化纯关键词）
 * @param {string} query - 查询文本
 * @param {object} options
 * @param {number} [options.maxResults=10]
 * @param {number} [options.keywordWeight=0.5]
 * @param {number} [options.vectorWeight=0.5]
 * @param {boolean} [options.expandGraph=false] - 对 top 文档展开 1-hop references 邻域
 * @param {number} [options.expandLimit=5] - 每个文档最多返回的邻域数
 */
export async function hybridWikiSearch(config, query, options = {}) {
    const maxResults = Math.max(1, options.maxResults ?? 10);
    const keywordWeight = options.keywordWeight ?? 0.5;
    const vectorWeight = options.vectorWeight ?? 0.5;
    // --- Channel A: keyword ---
    const graph = await loadGraphCached();
    const queryResult = await queryGraph(query);
    const { WIKI_ROOT } = await import('./wiki-store.js');
    const docMap = aggregateKeywordHits(queryResult, graph, WIKI_ROOT);
    const keywordHits = docMap.size;
    // --- Channel B: vector ---
    let vectorHits = 0;
    let vectorAvailable = false;
    if (config) {
        try {
            const vecResults = await searchWikiVector(config, query, { maxResults: maxResults * 2 });
            vectorAvailable = true;
            for (const r of vecResults) {
                const relPath = String(r.path || '').replace(/\\/g, '/');
                if (!relPath)
                    continue;
                const existing = docMap.get(relPath);
                if (existing) {
                    existing.vectorScore = Math.max(existing.vectorScore, r.score);
                    if (!existing.title && r.title)
                        existing.label = existing.label || r.title;
                }
                else {
                    docMap.set(relPath, {
                        docId: null,
                        label: r.title || relPath,
                        relPath,
                        category: r.category,
                        keywordScore: 0,
                        vectorScore: r.score,
                        matchedNodes: [],
                    });
                }
            }
            vectorHits = vecResults.length;
        }
        catch {
            vectorAvailable = false; // embedding/表不可用 → 退化
        }
    }
    // --- Fusion ---
    const wSum = (keywordHits > 0 ? keywordWeight : 0) + (vectorHits > 0 ? vectorWeight : 0);
    const wK = wSum > 0 ? (keywordHits > 0 ? keywordWeight : 0) / wSum : 0;
    const wV = wSum > 0 ? (vectorHits > 0 ? vectorWeight : 0) / wSum : 0;
    const fused = [...docMap.values()].map(d => ({
        ...d,
        score: wK * d.keywordScore + wV * d.vectorScore,
    }));
    fused.sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)));
    const top = fused.slice(0, maxResults);
    // --- Channel C: graph expansion (optional context) ---
    let expansions;
    if (options.expandGraph === true) {
        const expandLimit = Math.max(1, options.expandLimit ?? 5);
        expansions = {};
        for (const d of top.slice(0, 5)) { // 只对 top5 展开，控制开销
            if (!d.docId)
                continue;
            try {
                const t = await traverseGraph({ start: d.docId, depth: 1, edgeTypes: ['references'], maxNodes: expandLimit + 1 });
                if (t.found) {
                    expansions[d.relPath] = t.nodes
                        .filter(n => n.id !== d.docId && n.nodeType === 'document')
                        .slice(0, expandLimit)
                        .map(n => ({ id: n.id, label: n.label }));
                }
            }
            catch { /* 展开失败不阻塞主结果 */ }
        }
    }
    return {
        query,
        mode: 'hybrid',
        channels: {
            keyword: { hits: keywordHits, weight: wK },
            vector: { available: vectorAvailable, hits: vectorHits, weight: wV },
        },
        totalResults: top.length,
        results: top.map(d => ({
            label: d.label,
            path: d.relPath,
            docId: d.docId,
            category: d.category,
            score: Number(d.score.toFixed(4)),
            keywordScore: Number(d.keywordScore.toFixed(4)),
            vectorScore: Number(d.vectorScore.toFixed(4)),
            matchedNodes: d.matchedNodes.slice(0, 3),
            graphNeighbors: expansions?.[d.relPath],
        })),
    };
}
//# sourceMappingURL=wiki-hybrid.js.map
