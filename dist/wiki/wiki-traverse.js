/**
 * Wiki Traverse - 图遍历核心模块（M1）
 *
 * 功能：
 *   1. traverseGraph — N-hop BFS 邻居展开（深度/方向/边类型过滤）
 *   2. findGraphPath — 两节点间最短路径（BFS）
 *
 * 设计约束：
 *   - 不引入新依赖，纯内存 BFS（4350 节点/5435 边规模毫秒级）
 *   - graph.json (3.4MB) 带 mtime 缓存，避免每次调用重复 JSON.parse
 *   - 不改动 wiki-graph.js 既有函数（loadGraph/queryGraph 保持原行为）
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_ROOT, } from './wiki-store.js';
// ============================================================================
// Constants
// ============================================================================
const GRAPH_OUT_DIR = 'graphify-out';
const GRAPH_JSON_FILE = 'graph.json';
const DEFAULT_MAX_DEPTH = 2;
const MAX_DEPTH_LIMIT = 3;
const DEFAULT_MAX_NODES = 50;
const MAX_NODES_LIMIT = 200;
const DEFAULT_PATH_MAX_DEPTH = 5;
const PATH_MAX_DEPTH_LIMIT = 8;
// ============================================================================
// Cached Graph Loading (mtime-aware)
// ============================================================================
let _graphCache = null; // { filePath, mtimeMs, graph }
/** 加载图谱（带 mtime 缓存）。供 wiki-hybrid 等模块复用。 */
export async function loadGraphCached(graphPath) {
    const filePath = graphPath || path.join(WIKI_ROOT, GRAPH_OUT_DIR, GRAPH_JSON_FILE);
    if (!fs.existsSync(filePath)) {
        throw new Error(`图谱文件不存在: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (_graphCache && _graphCache.filePath === filePath && _graphCache.mtimeMs === stat.mtimeMs) {
        return _graphCache.graph;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const graph = {
        nodes: data.nodes || [],
        edges: data.links && !data.edges ? (data.links || []) : (data.edges || []),
    };
    _graphCache = { filePath, mtimeMs: stat.mtimeMs, graph };
    return graph;
}
/** 测试/调试用：强制失效缓存 */
export function invalidateGraphCache() {
    _graphCache = null;
}
// ============================================================================
// Adjacency Builder
// ============================================================================
/**
 * 构建邻接表
 * @returns {Map<string, Array<{neighbor: string, relation: string, direction: 'out'|'in', edgeIndex: number}>>}
 */
function buildAdjacency(edges) {
    const adj = new Map();
    edges.forEach((edge, edgeIndex) => {
        const rel = edge.relation || edge.type || 'unknown';
        if (!adj.has(edge.source))
            adj.set(edge.source, []);
        adj.get(edge.source).push({ neighbor: edge.target, relation: rel, direction: 'out', edgeIndex });
        if (!adj.has(edge.target))
            adj.set(edge.target, []);
        adj.get(edge.target).push({ neighbor: edge.source, relation: rel, direction: 'in', edgeIndex });
    });
    return adj;
}
// ============================================================================
// Node Resolution (id 精确 → label 精确 → label 包含)
// ============================================================================
function resolveNode(query, graph) {
    if (!query || typeof query !== 'string')
        return null;
    const q = query.trim();
    // 1. 精确 id
    let hit = graph.nodes.find(n => n.id === q);
    if (hit)
        return hit;
    const qLower = q.toLowerCase();
    // 2. 精确 label（大小写不敏感）
    hit = graph.nodes.find(n => String(n.label || '').toLowerCase() === qLower);
    if (hit)
        return hit;
    // 3. label 包含匹配：取 label 最短者（最具体），并列时取 document 优先
    const candidates = graph.nodes.filter(n => String(n.label || '').toLowerCase().includes(qLower));
    if (candidates.length === 0)
        return null;
    candidates.sort((a, b) => {
        const la = String(a.label || '').length, lb = String(b.label || '').length;
        if (la !== lb)
            return la - lb;
        const ta = a.nodeType === 'document' ? 0 : 1;
        const tb = b.nodeType === 'document' ? 0 : 1;
        return ta - tb;
    });
    return candidates[0];
}
// ============================================================================
// Filters
// ============================================================================
function makeEdgeFilter(edgeTypes) {
    if (!edgeTypes || edgeTypes.length === 0)
        return () => true;
    const allow = new Set(edgeTypes.map(t => String(t).toLowerCase()));
    return (relation) => allow.has(String(relation).toLowerCase());
}
function makeDirectionFilter(direction) {
    // direction: 'outgoing' | 'incoming' | 'both'
    if (direction === 'outgoing')
        return (dir) => dir === 'out';
    if (direction === 'incoming')
        return (dir) => dir === 'in';
    return () => true;
}
// ============================================================================
// Traverse (N-hop BFS)
// ============================================================================
/**
 * N-hop BFS 邻居展开
 *
 * @param {object} input
 * @param {string} input.start - 起点（节点 id 或 label 模糊匹配）
 * @param {number} [input.depth=2] - 展开深度（1-3）
 * @param {string} [input.direction='both'] - outgoing | incoming | both
 * @param {string[]} [input.edgeTypes] - 边类型过滤（contains/tagged_with/references）
 * @param {number} [input.maxNodes=50] - 返回节点上限（硬上限 200）
 * @param {string} [input.graphPath] - 自定义 graph.json 路径
 */
export async function traverseGraph(input) {
    const graph = await loadGraphCached(input.graphPath);
    const startNode = resolveNode(input.start, graph);
    if (!startNode) {
        return { found: false, error: `未找到起点节点: ${input.start}`, nodes: [], edges: [] };
    }
    const depth = Math.min(Math.max(1, input.depth ?? DEFAULT_MAX_DEPTH), MAX_DEPTH_LIMIT);
    const direction = ['outgoing', 'incoming', 'both'].includes(input.direction) ? input.direction : 'both';
    const maxNodes = Math.min(Math.max(1, input.maxNodes ?? DEFAULT_MAX_NODES), MAX_NODES_LIMIT);
    const edgeOk = makeEdgeFilter(input.edgeTypes);
    const dirOk = makeDirectionFilter(direction);
    const adj = buildAdjacency(graph.edges);
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
    // BFS
    const visited = new Map(); // nodeId -> depthReached
    const usedEdgeIndexes = new Set();
    const queue = [{ id: startNode.id, depth: 0 }];
    visited.set(startNode.id, 0);
    let truncated = false;
    while (queue.length > 0) {
        const { id, depth: d } = queue.shift();
        if (d >= depth)
            continue;
        const neighbors = adj.get(id) || [];
        for (const nb of neighbors) {
            if (!edgeOk(nb.relation) || !dirOk(nb.direction))
                continue;
            if (!visited.has(nb.neighbor)) {
                if (visited.size >= maxNodes) {
                    truncated = true;
                    break;
                }
                visited.set(nb.neighbor, d + 1);
                usedEdgeIndexes.add(nb.edgeIndex);
                queue.push({ id: nb.neighbor, depth: d + 1 });
            }
            else {
                // 已访问节点，但边仍属于子图（同层或向下一层的连接）
                usedEdgeIndexes.add(nb.edgeIndex);
            }
        }
        if (truncated)
            break;
    }
    // 组装结果（紧凑格式）
    const nodes = [...visited.entries()].map(([id, d]) => {
        const n = nodeById.get(id);
        return {
            id,
            label: n?.label ?? id,
            nodeType: n?.nodeType ?? 'unknown',
            category: n?.metadata?.category,
            depth: d,
        };
    });
    // 边去重：同一 source/target/relation 只保留一条（源数据可能有多条重复 references 边）
    const seenEdgeKeys = new Set();
    const edges = [];
    for (const i of usedEdgeIndexes) {
        const e = graph.edges[i];
        if (!visited.has(e.source) || !visited.has(e.target))
            continue;
        const rel = e.relation || e.type;
        const key = `${e.source}|${e.target}|${rel}`;
        if (seenEdgeKeys.has(key))
            continue;
        seenEdgeKeys.add(key);
        edges.push({ source: e.source, target: e.target, relation: rel });
    }
    return {
        found: true,
        start: { id: startNode.id, label: startNode.label, nodeType: startNode.nodeType },
        depth,
        direction,
        edgeTypes: input.edgeTypes ?? 'all',
        nodeCount: nodes.length,
        edgeCount: edges.length,
        truncated,
        nodes,
        edges,
    };
}
// ============================================================================
// Shortest Path (BFS)
// ============================================================================
/**
 * 两节点间最短路径（BFS，无视方向=both）
 *
 * @param {object} input
 * @param {string} input.from - 起点（id 或 label）
 * @param {string} input.to - 终点（id 或 label）
 * @param {number} [input.maxDepth=5] - 最大搜索深度（硬上限 8）
 * @param {string[]} [input.edgeTypes] - 边类型过滤
 * @param {string} [input.graphPath] - 自定义 graph.json 路径
 */
export async function findGraphPath(input) {
    const graph = await loadGraphCached(input.graphPath);
    const fromNode = resolveNode(input.from, graph);
    const toNode = resolveNode(input.to, graph);
    if (!fromNode)
        return { found: false, reachable: false, error: `未找到起点节点: ${input.from}` };
    if (!toNode)
        return { found: false, reachable: false, error: `未找到终点节点: ${input.to}` };
    const maxDepth = Math.min(Math.max(1, input.maxDepth ?? DEFAULT_PATH_MAX_DEPTH), PATH_MAX_DEPTH_LIMIT);
    const edgeOk = makeEdgeFilter(input.edgeTypes);
    const adj = buildAdjacency(graph.edges);
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
    if (fromNode.id === toNode.id) {
        return {
            found: true, reachable: true, hops: 0,
            path: [{ id: fromNode.id, label: fromNode.label, nodeType: fromNode.nodeType }],
            edges: [],
        };
    }
    // BFS with parent tracking
    const visited = new Set([fromNode.id]);
    // parent: nodeId -> { prevId, relation }
    const parent = new Map();
    const queue = [{ id: fromNode.id, depth: 0 }];
    let reached = false;
    while (queue.length > 0 && !reached) {
        const { id, depth: d } = queue.shift();
        if (d >= maxDepth)
            continue;
        for (const nb of (adj.get(id) || [])) {
            if (!edgeOk(nb.relation))
                continue;
            if (visited.has(nb.neighbor))
                continue;
            visited.add(nb.neighbor);
            parent.set(nb.neighbor, { prevId: id, relation: nb.relation });
            if (nb.neighbor === toNode.id) {
                reached = true;
                break;
            }
            queue.push({ id: nb.neighbor, depth: d + 1 });
        }
    }
    if (!reached) {
        return {
            found: true, reachable: false,
            from: { id: fromNode.id, label: fromNode.label },
            to: { id: toNode.id, label: toNode.label },
            maxDepth,
            message: `深度 ${maxDepth} 内不可达`,
        };
    }
    // 回溯路径
    const pathNodes = [];
    const pathEdges = [];
    let cur = toNode.id;
    while (cur !== fromNode.id) {
        const n = nodeById.get(cur);
        pathNodes.unshift({ id: cur, label: n?.label ?? cur, nodeType: n?.nodeType ?? 'unknown' });
        const p = parent.get(cur);
        pathEdges.unshift({ source: p.prevId, target: cur, relation: p.relation });
        cur = p.prevId;
    }
    pathNodes.unshift({ id: fromNode.id, label: fromNode.label, nodeType: fromNode.nodeType });
    return {
        found: true, reachable: true, hops: pathEdges.length,
        path: pathNodes,
        edges: pathEdges,
    };
}
//# sourceMappingURL=wiki-traverse.js.map
