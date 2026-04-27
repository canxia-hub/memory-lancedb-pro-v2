/**
 * Wiki Extractor - Markdown 内容提取器
 *
 * 对照 Python wiki_extractor.py 实现
 * 实现 Phase W3 契约: plans/contracts/wiki-graph-contract.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_ROOT, } from './wiki-store.js';
// ============================================================================
// Constants
// ============================================================================
const EXCLUDE_DIRS = ['graphify-out', 'templates', '__pycache__'];
// ============================================================================
// Front Matter Extraction (对照 Python extract_frontmatter)
// ============================================================================
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
export function extractFrontMatter(content) {
    if (!content.startsWith('---')) {
        return {};
    }
    const parts = content.split('---');
    if (parts.length < 3) {
        return {};
    }
    const yamlContent = parts[1].trim();
    const metadata = {};
    for (const line of yamlContent.split('\n')) {
        if (!line.includes(':'))
            continue;
        const colonIdx = line.indexOf(':');
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        if (value.startsWith('[') && value.endsWith(']')) {
            // Parse array format: ["tag1", "tag2"] or [tag1, tag2]
            const inner = value.slice(1, -1);
            metadata[key] = inner
                .split(',')
                .map((v) => v.trim().replace(/^["']|["']$/g, ''))
                .filter((v) => v.length > 0);
        }
        else {
            metadata[key] = value;
        }
    }
    return metadata;
}
// ============================================================================
// Headings Extraction (对照 Python extract_headings)
// ============================================================================
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
export function extractHeadings(content) {
    const headings = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#')) {
            const match = line.match(/^^(#+)/);
            const level = match ? match[1].length : 1;
            const title = line.replace(/^#+/, '').trim();
            headings.push({ level, title, line: i + 1 });
        }
    }
    return headings;
}
// ============================================================================
// Links Extraction (对照 Python extract_links)
// ============================================================================
/**
 * 提取 Wiki 链接
 *
 * Python 实现:
 *   pattern = r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]"
 *   for match in re.finditer(pattern, content):
 *       links.append({"target": match.group(1).strip(), "alias": match.group(2).strip() if match.group(2) else None, "raw": match.group(0)})
 */
export function extractLinks(content) {
    const links = [];
    // Pattern: [[target]] or [[target|display]]
    const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const target = match[1].trim();
        const alias = match[2] ? match[2].trim() : undefined;
        const raw = match[0];
        links.push({ target, alias, raw });
    }
    return links;
}
// ============================================================================
// Tags Extraction (对照 Python extract_tags)
// ============================================================================
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
export function extractTags(content) {
    const tags = [];
    // 1. 从 Front Matter 获取 tags
    const frontmatter = extractFrontMatter(content);
    const rawTags = frontmatter['tags'];
    if (Array.isArray(rawTags)) {
        tags.push(...rawTags);
    }
    else if (rawTags) {
        tags.push(String(rawTags));
    }
    // 2. 从正文提取 #tag 格式
    // Pattern: 支持中文标签，首字符必须是字母或中文
    const pattern = /#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const tag = match[1];
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
    }
    return tags;
}
// ============================================================================
// Link Target Resolution (对照 Python wiki_common.py)
// ============================================================================
/**
 * Normalize link target (对照 Python normalize_link_target)
 */
function normalizeLinkTarget(target) {
    let normalized = target.trim().replace(/\\/g, '/');
    if (normalized.endsWith('.md')) {
        normalized = normalized.slice(0, -3);
    }
    normalized = normalized.replace(/^\.\/+/, '');
    return normalized;
}
/**
 * Resolve link to doc ID (对照 Python resolve_link_to_doc_id)
 */
function resolveLinkToDocId(target) {
    const normalized = normalizeLinkTarget(target);
    return `doc_${normalized.replace(/\//g, '_')}`;
}
// ============================================================================
// File Extraction (对照 Python extract_file)
// ============================================================================
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
export async function extractFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileStem = path.basename(filePath, '.md');
    const fileId = `doc_${fileStem}`;
    const frontmatter = extractFrontMatter(content);
    const headings = extractHeadings(content);
    const links = extractLinks(content);
    const tags = extractTags(content);
    const nodes = [];
    const edges = [];
    // 1. Document node
    nodes.push({
        id: fileId,
        label: String(frontmatter['title'] || fileStem),
        nodeType: 'document',
        sourceFile: filePath,
        metadata: {
            category: frontmatter['category'] || 'unknown',
            status: frontmatter['status'] || 'draft',
            confidence: frontmatter['confidence'] || 0.8,
            agent: frontmatter['agent'] || 'unknown',
            created: frontmatter['created'] || '',
            updated: frontmatter['updated'] || '',
        },
    });
    // 2. Section nodes
    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const sectionId = `${fileId}_section_${i}`;
        nodes.push({
            id: sectionId,
            label: heading.title,
            nodeType: 'section',
            sourceFile: filePath,
            sourceLocation: `L${heading.line}`,
            metadata: { level: heading.level },
        });
        edges.push({
            source: fileId,
            target: sectionId,
            relation: 'contains',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            sourceFile: filePath,
            metadata: {},
        });
    }
    // 3. Tag nodes (对照 Python tag_id 规则)
    for (const tag of tags) {
        const tagId = `tag_${tag.toLowerCase().replace(/-/g, '_')}`;
        nodes.push({
            id: tagId,
            label: `#${tag}`,
            nodeType: 'tag',
            sourceFile: filePath,
            metadata: {},
        });
        edges.push({
            source: fileId,
            target: tagId,
            relation: 'tagged_with',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            sourceFile: filePath,
            metadata: {},
        });
    }
    // 4. Reference edges
    for (const link of links) {
        const targetId = resolveLinkToDocId(link.target);
        edges.push({
            source: fileId,
            target: targetId,
            relation: 'references',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            sourceFile: filePath,
            metadata: { alias: link.alias },
        });
    }
    // Build summary (对照 Python _document_summary)
    const isIndex = path.basename(filePath) === 'INDEX.md' || path.basename(filePath) === '_INDEX.md';
    const summary = {
        docId: fileId,
        title: String(frontmatter['title'] || fileStem),
        category: String(frontmatter['category'] || 'unknown'),
        isIndex,
        tags,
        headings: headings.slice(0, 8).map(h => h.title),
        file: filePath,
    };
    const metadata = {
        file: filePath,
        headingsCount: headings.length,
        linksCount: links.length,
        tagsCount: tags.length,
    };
    return { nodes, edges, summary, metadata };
}
// ============================================================================
// Wiki Extraction (对照 Python extract_wiki)
// ============================================================================
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
export async function extractWiki(wikiRoot, options) {
    const root = wikiRoot || WIKI_ROOT;
    const useLlm = options?.semantic || false;
    const allNodes = [];
    const allEdges = [];
    const summaries = [];
    const filesMetadata = [];
    // Recursively find all .md files
    const mdFiles = findAllMdFiles(root);
    for (const mdFile of mdFiles) {
        try {
            const result = await extractFile(mdFile);
            allNodes.push(...result.nodes);
            allEdges.push(...result.edges);
            summaries.push(result.summary);
            filesMetadata.push(result.metadata);
        }
        catch (error) {
            console.error(`Error extracting ${mdFile}: ${error.message}`);
        }
    }
    // Semantic inference (currently disabled - must be gracefully degraded)
    let semanticEdges = [];
    let semanticError = 'semantic disabled';
    if (useLlm) {
        // TODO: Implement semantic inference via DashScope API
        // Currently gracefully degraded - semantic is optional
        semanticError = 'semantic inference not implemented in TypeScript (use Python for now)';
    }
    allEdges.push(...semanticEdges);
    // Deduplicate nodes (对照 Python seen_nodes logic)
    const seenNodeIds = new Set();
    const uniqueNodes = [];
    for (const node of allNodes) {
        if (!seenNodeIds.has(node.id)) {
            seenNodeIds.add(node.id);
            uniqueNodes.push(node);
        }
    }
    const metadata = {
        files: filesMetadata,
        totalNodes: uniqueNodes.length,
        totalEdges: allEdges.length,
        semanticEdges: semanticEdges.length,
        semanticError,
        llmEnabled: useLlm,
    };
    return {
        nodes: uniqueNodes,
        edges: allEdges,
        metadata,
    };
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * 递归查找所有 Markdown 文件（跳过排除目录）
 */
function findAllMdFiles(root) {
    const files = [];
    function walk(dir) {
        if (!fs.existsSync(dir))
            return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (EXCLUDE_DIRS.includes(entry.name))
                    continue;
                walk(path.join(dir, entry.name));
            }
            else if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(path.join(dir, entry.name));
            }
        }
    }
    walk(root);
    return files;
}
//# sourceMappingURL=wiki-extractor.js.map