/**
 * Wiki Extractor - Markdown 内容提取器
 *
 * 对照 Python wiki_extractor.py 实现
 * 实现 Phase W3 契约: plans/contracts/wiki-graph-contract.ts
 */
import type { WikiGraphNode, WikiGraphEdge } from './types.js';
/**
 * Extracted file result structure (matches wiki-graph-contract.ts)
 */
export interface ExtractedWikiFile {
    nodes: WikiGraphNode[];
    edges: WikiGraphEdge[];
    summary: {
        docId: string;
        title: string;
        category: string;
        isIndex: boolean;
        tags: string[];
        headings: string[];
        file: string;
    };
    metadata: {
        file: string;
        headingsCount: number;
        linksCount: number;
        tagsCount: number;
    };
}
/**
 * Wiki extraction result structure (matches wiki-graph-contract.ts)
 */
export interface WikiExtractionResult {
    nodes: WikiGraphNode[];
    edges: WikiGraphEdge[];
    metadata: {
        files: Array<{
            file: string;
            headingsCount: number;
            linksCount: number;
            tagsCount: number;
        }>;
        totalNodes: number;
        totalEdges: number;
        semanticEdges: number;
        semanticError: string | null;
        llmEnabled: boolean;
    };
}
/**
 * 提取 YAML Front Matter
 *
 * Python 实现:
 *   if content.startswith("---"):
 *       parts = content.split("---", 2)
 *       if len(parts) >= 3:
 *           metadata: dict[str, Any] = {}
 *           for line in parts[1].strip().splitlines():
 *               if ":" not in line: continue
 *               key, value = line.split(":", 1)
 */
export declare function extractFrontMatter(content: string): Record<string, unknown>;
/**
 * 提取标题列表
 *
 * Python 实现:
 *   headings = []
 *   for i, line in enumerate(content.splitlines(), 1):
 *       if line.startswith("#"):
 *           m = re.match(r"^(#+)", line)
 *           level = len(m.group(1)) if m else 1
 *           headings.append({"level": level, "title": line.lstrip("#").strip(), "line": i})
 */
export declare function extractHeadings(content: string): Array<{
    level: number;
    title: string;
    line: number;
}>;
/**
 * 提取 Wiki 链接
 *
 * Python 实现:
 *   pattern = r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]"
 *   for match in re.finditer(pattern, content):
 *       links.append({"target": match.group(1).strip(), "alias": match.group(2).strip() if match.group(2) else None, "raw": match.group(0)})
 */
export declare function extractLinks(content: string): Array<{
    target: string;
    alias?: string;
    raw: string;
}>;
/**
 * 提取标签（双来源：Front Matter + 正文 #tag）
 *
 * Python 实现:
 *   tags: list[str] = []
 *   frontmatter = self.extract_frontmatter(content)
 *   raw_tags = frontmatter.get("tags", [])
 *   if isinstance(raw_tags, list):
 *       tags.extend(raw_tags)
 *   elif raw_tags:
 *       tags.append(str(raw_tags))
 *   pattern = r"#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)"
 *   for match in re.finditer(pattern, content):
 *       tag = match.group(1)
 *       if tag not in tags:
 *           tags.append(tag)
 */
export declare function extractTags(content: string): string[];
/**
 * 提取单个文件
 *
 * Python 实现:
 *   content = file_path.read_text(encoding="utf-8")
 *   file_id = f"doc_{file_path.stem}"
 *   frontmatter = self.extract_frontmatter(content)
 *   headings = self.extract_headings(content)
 *   links = self.extract_links(content)
 *   tags = self.extract_tags(content)
 *
 *   nodes: list[dict[str, Any]] = []
 *   edges: list[dict[str, Any]] = []
 *
 *   # Document node
 *   nodes.append(asdict(WikiNode(
 *       id=file_id,
 *       label=frontmatter.get("title", file_path.stem),
 *       node_type="document",
 *       source_file=str(file_path),
 *       metadata={...}
 *   )))
 *
 *   # Section nodes
 *   for i, heading in enumerate(headings):
 *       section_id = f"{file_id}_section_{i}"
 *       nodes.append(asdict(WikiNode(...)))
 *       edges.append(asdict(WikiEdge(source=file_id, target=section_id, relation="contains")))
 *
 *   # Tag nodes
 *   for tag in tags:
 *       tag_id = f"tag_{tag.lower().replace('-', '_')}"
 *       nodes.append(asdict(WikiNode(...)))
 *       edges.append(asdict(WikiEdge(source=file_id, target=tag_id, relation="tagged_with")))
 *
 *   # Reference edges
 *   for link in links:
 *       edges.append(asdict(WikiEdge(
 *           source=file_id,
 *           target=resolve_link_to_doc_id(link["target"]),
 *           relation="references",
 *           metadata={"alias": link["alias"]}
 *       )))
 */
export declare function extractFile(filePath: string): Promise<ExtractedWikiFile>;
/**
 * 提取整个 Wiki 知识库
 *
 * Python 实现:
 *   extractor = MarkdownExtractor(use_llm=use_llm, ...)
 *   all_nodes: list[dict[str, Any]] = []
 *   all_edges: list[dict[str, Any]] = []
 *   summaries: list[dict[str, Any]] = []
 *   metadata = {...}
 *
 *   for md_file in wiki_path.rglob("*.md"):
 *       if any(part in {"graphify-out", "templates", "__pycache__"} for part in md_file.parts):
 *           continue
 *       result = extractor.extract_file(md_file)
 *       all_nodes.extend(result["nodes"])
 *       all_edges.extend(result["edges"])
 *       summaries.append(result["summary"])
 *       metadata["files"].append(result["metadata"])
 *
 *   semantic_edges, semantic_error = extractor.infer_semantic_edges(summaries)
 *   all_edges.extend(semantic_edges)
 *
 *   # Deduplicate nodes
 *   seen_nodes = set()
 *   unique_nodes = []
 *   for node in all_nodes:
 *       if node["id"] not in seen_nodes:
 *           seen_nodes.add(node["id"])
 *           unique_nodes.append(node)
 */
export declare function extractWiki(wikiRoot?: string, options?: {
    semantic?: boolean;
    model?: string;
}): Promise<WikiExtractionResult>;
//# sourceMappingURL=wiki-extractor.d.ts.map