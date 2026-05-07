/**
 * Wiki Graph - 图谱构建、加载、查询与分析
 *
 * 对照 Python wiki-build-graph.py + wiki-query.py 实现
 * 实现 Phase W3 契约: plans/contracts/wiki-graph-contract.ts
 *
 * 注意：不引入 networkx 等新依赖，使用纯 JSON 结构
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_ROOT, } from './wiki-store.js';
import { extractWiki, } from './wiki-extractor.js';
// ============================================================================
// Constants
// ============================================================================
const GRAPH_OUT_DIR = 'graphify-out';
const GRAPH_JSON_FILE = 'graph.json';
const REPORT_FILE = 'GRAPH_REPORT.md';
const HTML_FILE = 'graph.html';
// ============================================================================
// Graph Loading (对照 Python wiki-query.py load_graph)
// ============================================================================
/**
 * 加载图谱
 *
 * Python 实现:
 *   graph_path = GRAPH_OUT / "graph.json"
 *   return json.loads(graph_path.read_text(encoding="utf-8"))
 *
 * networkx 格式: {"nodes": [...], "links": [...]} (注意: networkx 用 "links" 而非 "edges")
 */
export async function loadGraph(graphPath) {
    const defaultPath = path.join(WIKI_ROOT, GRAPH_OUT_DIR, GRAPH_JSON_FILE);
    const filePath = graphPath || defaultPath;
    if (!fs.existsSync(filePath)) {
        throw new Error(`图谱文件不存在: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    // Handle networkx format (links -> edges)
    // Python networkx uses "links" for edges
    if (data.links && !data.edges) {
        return {
            nodes: data.nodes || [],
            edges: data.links || [],
        };
    }
    return {
        nodes: data.nodes || [],
        edges: data.edges || [],
    };
}
// ============================================================================
// Graph Query (对照 Python wiki-query.py score_node + main)
// ============================================================================
/**
 * 计算节点匹配分数
 *
 * Python 实现:
 *   def score_node(node: dict, query: str) -> int:
 *       q = query.lower()
 *       score = 0
 *       label = str(node.get("label", "")).lower()
 *       if q in label:
 *           score += 10
 *       for key in ("category", "status", "agent"):
 *           if q in str(node.get(key, "")).lower():
 *               score += 3
 *       return score
 */
function scoreNode(node, query) {
    const q = query.toLowerCase();
    let score = 0;
    const label = String(node.label || '').toLowerCase();
    if (label.includes(q)) {
        score += 10;
    }
    // Check metadata fields (category, status, agent)
    const category = String(node.metadata?.category || '').toLowerCase();
    const status = String(node.metadata?.status || '').toLowerCase();
    const agent = String(node.metadata?.agent || '').toLowerCase();
    if (category.includes(q))
        score += 3;
    if (status.includes(q))
        score += 3;
    if (agent.includes(q))
        score += 3;
    return score;
}
/**
 * 查询图谱
 *
 * Python 实现:
 *   ranked = []
 *   for node in nodes:
 *       score = score_node(node, query)
 *       if score > 0:
 *           ranked.append((score, node))
 *   ranked.sort(key=lambda x: (-x[0], x[1].get("label", "")))
 *
 *   top_nodes = [node for _, node in ranked[:10]]
 *   node_ids = {n.get("id") for n in top_nodes}
 *   node_lookup = {n.get("id"): n for n in nodes}
 *   related = [e for e in links if e.get("source") in node_ids or e.get("target") in node_ids]
 */
export async function queryGraph(query, graphPath) {
    const graph = await loadGraph(graphPath);
    const nodes = graph.nodes;
    const edges = graph.edges;
    // Score and rank nodes
    const ranked = [];
    for (const node of nodes) {
        const score = scoreNode(node, query);
        if (score > 0) {
            ranked.push({ score, node });
        }
    }
    // Sort by score descending, then by label
    ranked.sort((a, b) => {
        if (a.score !== b.score)
            return b.score - a.score;
        return String(a.node.label || '').localeCompare(String(b.node.label || ''));
    });
    // Top 10 matched nodes
    const topNodes = ranked.slice(0, 10);
    const nodeIds = new Set(topNodes.map(item => item.node.id));
    // Build node lookup
    const nodeLookup = new Map();
    for (const node of nodes) {
        nodeLookup.set(node.id, node);
    }
    // Find related edges
    const relatedEdges = [];
    for (const edge of edges) {
        if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
            relatedEdges.push(edge);
        }
    }
    // Check graph staleness (simplified - just check if file exists)
    const defaultPath = path.join(WIKI_ROOT, GRAPH_OUT_DIR, GRAPH_JSON_FILE);
    let graphWasStale = false;
    if (!fs.existsSync(defaultPath)) {
        graphWasStale = true;
    }
    return {
        matchedNodes: topNodes,
        relatedEdges,
        graphWasStale,
    };
}
// ============================================================================
// Community Detection (对照 Python detect_communities)
// ============================================================================
/**
 * 社区检测 - 使用连通分量算法（轻量实现，无第三方库）
 *
 * Python 实现:
 *   if G.number_of_nodes() == 0: return {}
 *   communities: dict[str, int] = {}
 *   for i, component in enumerate(nx.connected_components(G.to_undirected())):
 *       for node in component:
 *           communities[node] = i
 *   return communities
 */
function detectCommunities(graph) {
    if (graph.nodes.length === 0) {
        return new Map();
    }
    // Build undirected adjacency list
    const adjacency = new Map();
    for (const node of graph.nodes) {
        adjacency.set(node.id, new Set());
    }
    for (const edge of graph.edges) {
        // Add both directions for undirected graph
        const sourceSet = adjacency.get(edge.source);
        const targetSet = adjacency.get(edge.target);
        if (sourceSet && targetSet) {
            sourceSet.add(edge.target);
            targetSet.add(edge.source);
        }
    }
    // BFS to find connected components
    const visited = new Set();
    const communities = new Map();
    let communityId = 0;
    for (const node of graph.nodes) {
        if (visited.has(node.id))
            continue;
        // BFS from this node
        const queue = [node.id];
        const component = [];
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            component.push(current);
            const neighbors = adjacency.get(current);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        queue.push(neighbor);
                    }
                }
            }
        }
        // Assign community ID
        for (const nodeId of component) {
            communities.set(nodeId, communityId);
        }
        communityId++;
    }
    return communities;
}
// ============================================================================
// Graph Analysis (对照 Python analyze_graph)
// ============================================================================
/**
 * 分析图谱
 *
 * Python 实现:
 *   analysis = {
 *       "total_nodes": G.number_of_nodes(),
 *       "total_edges": G.number_of_edges(),
 *       "total_communities": len(set(communities.values())),
 *       "node_types": {},
 *       "edge_types": {},
 *       "god_nodes": [],
 *       "orphan_nodes": [],
 *       "semantic_edges": meta.get("semantic_edges", 0),
 *       "semantic_error": meta.get("semantic_error"),
 *       "llm_enabled": meta.get("llm_enabled", False),
 *   }
 */
export function analyzeGraph(graph, metadata) {
    const nodeTypes = {};
    const edgeTypes = {};
    // Count node types
    for (const node of graph.nodes) {
        const type = node.nodeType || 'unknown';
        nodeTypes[type] = (nodeTypes[type] || 0) + 1;
    }
    // Count edge types
    for (const edge of graph.edges) {
        const relation = edge.relation || 'unknown';
        edgeTypes[relation] = (edgeTypes[relation] || 0) + 1;
    }
    // Calculate degree for each node
    const degrees = new Map();
    for (const node of graph.nodes) {
        degrees.set(node.id, 0);
    }
    for (const edge of graph.edges) {
        // Increment degree for both source and target
        const sourceDeg = degrees.get(edge.source) || 0;
        const targetDeg = degrees.get(edge.target) || 0;
        degrees.set(edge.source, sourceDeg + 1);
        degrees.set(edge.target, targetDeg + 1);
    }
    // God nodes (top 10 by degree)
    const sortedByDegree = Array.from(degrees.entries())
        .sort((a, b) => b[1] - a[1]);
    const godNodes = [];
    const nodeLookup = new Map();
    for (const node of graph.nodes) {
        nodeLookup.set(node.id, node);
    }
    for (const [nodeId, degree] of sortedByDegree.slice(0, 10)) {
        if (degree <= 0)
            continue;
        const node = nodeLookup.get(nodeId);
        if (node) {
            godNodes.push({
                id: nodeId,
                label: node.label,
                degree,
                nodeType: node.nodeType,
                sourceFile: node.sourceFile,
            });
        }
    }
    // Orphan nodes (degree = 0)
    const orphanNodes = [];
    for (const [nodeId, degree] of degrees.entries()) {
        if (degree === 0) {
            const node = nodeLookup.get(nodeId);
            if (node) {
                orphanNodes.push({ id: nodeId, label: node.label });
            }
        }
    }
    // Detect communities
    const communities = detectCommunities(graph);
    const uniqueCommunities = new Set(communities.values());
    const totalCommunities = uniqueCommunities.size;
    return {
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        totalCommunities,
        nodeTypes,
        edgeTypes,
        godNodes,
        orphanNodes,
        semanticEdges: metadata?.semanticEdges || 0,
        semanticError: metadata?.semanticError || null,
        llmEnabled: metadata?.llmEnabled || false,
    };
}
// ============================================================================
// Report Generation (对照 Python generate_report)
// ============================================================================
/**
 * 获取文档链接（相对路径）
 */
function docLink(sourceFile) {
    if (!sourceFile)
        return '-';
    try {
        const rel = path.relative(WIKI_ROOT, sourceFile).replace(/\.md$/, '').replace(/\\/g, '/');
        return rel;
    }
    catch {
        return sourceFile;
    }
}
/**
 * 生成图谱报告
 *
 * Python 实现:
 *   report = f"""# Wiki 知识图谱报告
 *   **生成时间**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
 *   **知识库路径**: {wiki_path}
 *   ...
 */
export function generateGraphReport(graph, analysis, wikiRoot) {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const root = wikiRoot || WIKI_ROOT;
    const lines = [];
    lines.push('# Wiki 知识图谱报告');
    lines.push('');
    lines.push(`**生成时间**: ${now}`);
    lines.push(`**知识库路径**: ${root}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 概览');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push(`| 总节点数 | ${analysis.totalNodes} |`);
    lines.push(`| 总边数 | ${analysis.totalEdges} |`);
    lines.push(`| 社区数 | ${analysis.totalCommunities} |`);
    lines.push(`| LLM 语义增强 | ${analysis.llmEnabled ? '开启' : '关闭'} |`);
    lines.push(`| 语义边数 | ${analysis.semanticEdges} |`);
    lines.push(`| 语义状态 | ${analysis.semanticError || 'ok'} |`);
    lines.push('');
    lines.push('## 节点分布');
    lines.push('');
    lines.push('| 类型 | 数量 |');
    lines.push('|------|------|');
    const sortedNodeTypes = Object.entries(analysis.nodeTypes)
        .sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedNodeTypes) {
        lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');
    lines.push('## 关系分布');
    lines.push('');
    lines.push('| 关系类型 | 数量 |');
    lines.push('|----------|------|');
    const sortedEdgeTypes = Object.entries(analysis.edgeTypes)
        .sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedEdgeTypes) {
        lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');
    lines.push('## 核心节点 (God Nodes)');
    lines.push('');
    lines.push('| 节点 | 类型 | 度数 | 来源 |');
    lines.push('|------|------|------|------|');
    for (const node of analysis.godNodes) {
        lines.push(`| ${node.label} | ${node.nodeType || '-'} | ${node.degree} | ${docLink(node.sourceFile)} |`);
    }
    if (analysis.orphanNodes.length > 0) {
        lines.push('');
        lines.push('## 孤立节点');
        lines.push('');
        for (const node of analysis.orphanNodes.slice(0, 10)) {
            lines.push(`- ${node.label}`);
        }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 使用建议');
    lines.push('');
    lines.push('1. 先读 `INDEX.md` 和分类 `_INDEX.md`，再顺着双向链接深入。');
    lines.push('2. 写入新条目后优先运行图谱构建命令。');
    lines.push('3. 需要更强的跨文档语义关联时，可使用语义增强功能。');
    lines.push('');
    lines.push('## 维护命令');
    lines.push('');
    lines.push('```');
    lines.push('wiki-build       # 构建图谱');
    lines.push('wiki-query <关键词>  # 查询图谱');
    lines.push('```');
    lines.push('');
    return lines.join('\n');
}
// ============================================================================
// HTML Export (对照 Python export_graph_html)
// ============================================================================
/**
 * 导出图谱 HTML（轻量版）
 *
 * Python 实现:
 *   degrees = dict(G.degree())
 *   cards = []
 *   for node_id, degree in sorted(degrees.items(), key=lambda x: -x[1])[:20]:
 *       ...
 */
function generateGraphHtml(graph, analysis) {
    // Build node cards for god nodes
    const cards = [];
    for (const node of analysis.godNodes.slice(0, 20)) {
        if (node.degree <= 0)
            continue;
        cards.push(`<div class="node-card">` +
            `<h3>${node.label}</h3>` +
            `<div class="type">${node.nodeType || 'unknown'}</div>` +
            `<div class="degree">度数: ${node.degree}</div>` +
            `</div>`);
    }
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Wiki 知识图谱</title>
<style>
body { font-family: -apple-system, sans-serif; margin: 20px; background: #f5f5f5; }
.container { max-width: 1200px; margin: 0 auto; }
h1 { color: #333; }
.stats, .god-nodes { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
.stats table { width: 100%; border-collapse: collapse; }
.stats th, .stats td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
.node-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
.node-card { background: #e3f2fd; padding: 10px; border-radius: 4px; }
.node-card h3 { margin: 0 0 5px 0; font-size: 14px; }
.node-card .type { font-size: 12px; color: #666; }
.node-card .degree { font-size: 12px; color: #1976d2; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<h1>Wiki 知识图谱</h1>
<div class="stats">
<h2>统计信息</h2>
<table>
<tr><th>指标</th><th>数值</th></tr>
<tr><td>总节点数</td><td>${analysis.totalNodes}</td></tr>
<tr><td>总边数</td><td>${analysis.totalEdges}</td></tr>
<tr><td>社区数</td><td>${analysis.totalCommunities}</td></tr>
<tr><td>语义边</td><td>${analysis.semanticEdges}</td></tr>
</table>
</div>
<div class="god-nodes">
<h2>核心节点</h2>
<div class="node-list">
${cards.join('\n')}
</div>
</div>
</div>
</body>
</html>`;
    return html;
}
// ============================================================================
// Graph JSON Export (对照 Python export_graph_json)
// ============================================================================
/**
 * 导出图谱 JSON（networkx 格式）
 *
 * Python 实现:
 *   for node in G.nodes():
 *       G.nodes[node]["community"] = communities.get(node, 0)
 *   data = json_graph.node_link_data(G, edges="links")
 */
function generateGraphJson(graph, communities) {
    // Add community to each node's metadata
    const nodesWithCommunity = graph.nodes.map(node => ({
        ...node,
        metadata: {
            ...node.metadata,
            community: communities.get(node.id) || 0,
        },
    }));
    // Use "links" key for networkx compatibility
    return {
        nodes: nodesWithCommunity,
        links: graph.edges,
        buildTime: new Date().toISOString(),
    };
}
// ============================================================================
// Build Wiki Graph (对照 Python main)
// ============================================================================
/**
 * 构建 Wiki 知识图谱
 *
 * Python 实现:
 *   GRAPH_OUT.mkdir(exist_ok=True)
 *   G, meta = build_wiki_graph(WIKI_ROOT, use_llm=args.semantic, model=args.model)
 *   communities = detect_communities(G)
 *   analysis = analyze_graph(G, communities, meta)
 *   report_path = GRAPH_OUT / "GRAPH_REPORT.md"
 *   report_path.write_text(generate_report(G, analysis, WIKI_ROOT), encoding="utf-8")
 *   export_graph_json(G, communities, GRAPH_OUT / "graph.json")
 *   export_graph_html(G, communities, GRAPH_OUT / "graph.html")
 */
export async function buildWikiGraph(options) {
    const root = options?.wikiRoot || WIKI_ROOT;
    // 1. Extract wiki content
    console.log(`正在提取 Wiki 知识库: ${root}`);
    const extraction = await extractWiki(root, {
        semantic: options?.semantic,
        model: options?.model,
    });
    console.log(`提取结果: ${extraction.nodes.length} 节点, ${extraction.edges.length} 边, ` +
        `语义边 ${extraction.metadata.semanticEdges}`);
    // 2. Build graph
    const graph = {
        nodes: extraction.nodes,
        edges: extraction.edges,
    };
    // 3. Detect communities
    const communities = detectCommunities(graph);
    const uniqueCommunities = new Set(communities.values());
    console.log(`检测到 ${uniqueCommunities.size} 个社区`);
    // 4. Analyze graph
    const analysis = analyzeGraph(graph, extraction.metadata);
    // 5. Ensure output directory exists
    const outDir = path.join(root, GRAPH_OUT_DIR);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    // 6. Export files
    const graphPath = path.join(outDir, GRAPH_JSON_FILE);
    const reportPath = path.join(outDir, REPORT_FILE);
    const htmlPath = path.join(outDir, HTML_FILE);
    // Write graph.json
    const graphJson = generateGraphJson(graph, communities);
    fs.writeFileSync(graphPath, JSON.stringify(graphJson, null, 2), 'utf-8');
    console.log(`已导出图谱: ${graphPath}`);
    // Write report
    const report = generateGraphReport(graph, analysis, root);
    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`已生成报告: ${reportPath}`);
    // Write HTML
    const html = generateGraphHtml(graph, analysis);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`已导出 HTML: ${htmlPath}`);
    console.log('\n✅ Wiki 知识图谱构建完成!');
    console.log(`   节点: ${graph.nodes.length}`);
    console.log(`   边: ${graph.edges.length}`);
    console.log(`   社区: ${uniqueCommunities.size}`);
    console.log(`   语义边: ${extraction.metadata.semanticEdges}`);
    return {
        graph,
        analysis,
        graphPath,
        reportPath,
        htmlPath,
    };
}
//# sourceMappingURL=wiki-graph.js.map