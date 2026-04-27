/**
 * Wiki Graph - 图谱构建、加载、查询与分析
 *
 * 对照 Python wiki-build-graph.py + wiki-query.py 实现
 * 实现 Phase W3 契约: plans/contracts/wiki-graph-contract.ts
 *
 * 注意：不引入 networkx 等新依赖，使用纯 JSON 结构
 */
import type { WikiGraph, WikiGraphNode, WikiGraphEdge } from './types.js';
import { WikiExtractionResult } from './wiki-extractor.js';
export interface WikiGraphAnalysis {
    totalNodes: number;
    totalEdges: number;
    totalCommunities: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
    godNodes: Array<{
        id: string;
        label: string;
        degree: number;
        nodeType?: string;
        sourceFile?: string;
    }>;
    orphanNodes: Array<{
        id: string;
        label: string;
    }>;
    semanticEdges: number;
    semanticError: string | null;
    llmEnabled: boolean;
}
export interface WikiBuildResult {
    graph: WikiGraph;
    analysis: WikiGraphAnalysis;
    graphPath: string;
    reportPath: string;
    htmlPath: string;
}
/**
 * 加载图谱
 *
 * Python 实现:
 *   graph_path = GRAPH_OUT / "graph.json"
 *   return json.loads(graph_path.read_text(encoding="utf-8"))
 *
 * networkx 格式: {"nodes": [...], "links": [...]} (注意: networkx 用 "links" 而非 "edges")
 */
export declare function loadGraph(graphPath?: string): Promise<WikiGraph>;
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
export declare function queryGraph(query: string, graphPath?: string): Promise<{
    matchedNodes: Array<{
        node: WikiGraphNode;
        score: number;
    }>;
    relatedEdges: WikiGraphEdge[];
    graphWasStale: boolean;
}>;
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
export declare function analyzeGraph(graph: WikiGraph, metadata?: WikiExtractionResult['metadata']): WikiGraphAnalysis;
/**
 * 生成图谱报告
 *
 * Python 实现:
 *   report = f"""# Wiki 知识图谱报告
 *   **生成时间**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
 *   **知识库路径**: {wiki_path}
 *   ...
 */
export declare function generateGraphReport(graph: WikiGraph, analysis: WikiGraphAnalysis, wikiRoot?: string): string;
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
export declare function buildWikiGraph(options?: {
    wikiRoot?: string;
    semantic?: boolean;
    model?: string;
}): Promise<WikiBuildResult>;
//# sourceMappingURL=wiki-graph.d.ts.map