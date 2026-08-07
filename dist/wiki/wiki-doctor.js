/**
 * Wiki Doctor - Wiki 健康检查
 *
 * 对照 Python wiki_ops.py doctor 功能
 * M4 增强：图质量分析（references 维度孤岛/标签覆盖/枢纽中心性）
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_CATEGORIES, } from './types.js';
import { WIKI_ROOT, normalizeLinkTarget, resolveLinkToPath, } from './wiki-store.js';
import { loadGraphCached, } from './wiki-traverse.js';
// ============================================================================
// Health Check
// ============================================================================
/**
 * 检查 Wiki 健康状态
 *
 * 检查项:
 * 1. 核心文件存在性（INDEX.md, 各分类 _INDEX.md）
 * 2. 坏链检测（[[wikilinks]] 指向不存在的目标）
 * 3. 图谱新鲜度（graph.json 是否过期）
 */
export async function checkWikiHealth() {
    const missingFiles = [];
    const brokenLinks = [];
    // 1. Check core files
    const coreFiles = [
        'INDEX.md',
        ...WIKI_CATEGORIES.map(c => path.join(c, '_INDEX.md')),
    ];
    for (const file of coreFiles) {
        const fullPath = path.join(WIKI_ROOT, file);
        if (!fs.existsSync(fullPath)) {
            missingFiles.push(file);
        }
    }
    // 2. Check broken links
    const brokenLinkCount = await detectBrokenLinks(brokenLinks);
    // 3. Check graph freshness
    const graphResult = checkGraphFreshness();
    // Determine overall health
    const healthy = missingFiles.length === 0 && brokenLinkCount === 0 && !graphResult.stale;
    return {
        coreFilesOk: missingFiles.length === 0,
        missingFiles,
        brokenLinkCount,
        brokenLinks,
        graphStale: graphResult.stale,
        graphStaleReason: graphResult.reason,
        healthy,
    };
}
// ============================================================================
// Graph Quality Analysis (M4)
// ============================================================================
/**
 * 图质量分析：references 维度的真实连通性指标
 *
 * 背景：全边度数被 contains 边（78%）主导，无法反映文档间真实互联。
 * 本函数只看 references/tagged_with 维度：
 *   1. 孤岛文档：零 references 出入边的 document
 *   2. tag 覆盖率：有 ≥1 条 tagged_with 出边的 document 占比
 *   3. 枢纽中心性：references 总度数 top-20 的 document
 */
export async function analyzeGraphQuality() {
    let graph;
    try {
        graph = await loadGraphCached();
    }
    catch {
        return { available: false, reason: 'graph.json 不可用' };
    }
    const documents = graph.nodes.filter(n => n.nodeType === 'document');
    const docById = new Map(documents.map(d => [d.id, d]));
    // references 维度度数
    const refDegree = new Map(); // docId -> {out, in}
    for (const d of documents)
        refDegree.set(d.id, { out: 0, in: 0 });
    const taggedDocs = new Set();
    for (const e of graph.edges) {
        const rel = e.relation || e.type;
        if (rel === 'references') {
            if (refDegree.has(e.source))
                refDegree.get(e.source).out++;
            if (refDegree.has(e.target))
                refDegree.get(e.target).in++;
        }
        else if (rel === 'tagged_with') {
            if (docById.has(e.source))
                taggedDocs.add(e.source);
        }
    }
    // 孤岛文档（references 出入度均为 0）
    const isolated = documents
        .filter(d => {
        const deg = refDegree.get(d.id);
        return deg && deg.out === 0 && deg.in === 0;
    })
        .map(d => ({ id: d.id, label: d.label, category: d.metadata?.category }));
    // 枢纽 top-20（references 总度数）
    const topHubs = [...refDegree.entries()]
        .map(([id, deg]) => ({
        id,
        label: docById.get(id)?.label ?? id,
        degree: deg.out + deg.in,
        out: deg.out,
        in: deg.in,
    }))
        .filter(x => x.degree > 0)
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 20);
    return {
        available: true,
        totalDocuments: documents.length,
        isolatedCount: isolated.length,
        isolatedDocs: isolated.slice(0, 20),
        isolatedTruncated: isolated.length > 20,
        tagCoverage: {
            tagged: taggedDocs.size,
            total: documents.length,
            ratio: documents.length > 0 ? Number((taggedDocs.size / documents.length).toFixed(3)) : 0,
        },
        topHubs,
    };
}
// ============================================================================
// Broken Link Detection
// ============================================================================
/**
 * 提取文档中的 Wiki 链接（对照 Python wiki-sync-links.py extract_links）
 */
function extractWikiLinks(content) {
    // Pattern: [[target]] or [[target|display]]
    const pattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const links = [];
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const target = normalizeLinkTarget(match[1]);
        links.push(target);
    }
    return links;
}
/**
 * 检测坏链
 *
 * 解析规则（M4 收口统一）：
 *   1. 先试 resolveLinkToPath（WIKI_ROOT 直接路径 + 5 个标准分类目录）
 *   2. 失败后回退全库 stem 索引（任意目录下的同名 .md）——与提取器
 *      resolveLinkToDocId 的 doc_<stem> 语义对齐，避免专题库文档被误报为坏链
 */
async function detectBrokenLinks(brokenLinks) {
    let count = 0;
    // 全库 stem 索引（懒构建一次）：stem(文件名无扩展) -> 绝对路径
    const EXCLUDE = new Set(['graphify-out', 'templates', '__pycache__', '.openclaw-wiki', 'node_modules', '.git']);
    const stemIndex = new Map();
    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const ent of entries) {
            if (ent.name.startsWith('.'))
                continue;
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                if (!EXCLUDE.has(ent.name))
                    walk(full);
            }
            else if (ent.name.endsWith('.md')) {
                const stem = ent.name.slice(0, -3);
                if (!stemIndex.has(stem))
                    stemIndex.set(stem, full);
            }
        }
    };
    walk(WIKI_ROOT);
    // Scan all .md files
    for (const category of WIKI_CATEGORIES) {
        const categoryPath = path.join(WIKI_ROOT, category);
        if (!fs.existsSync(categoryPath))
            continue;
        const files = fs.readdirSync(categoryPath);
        for (const file of files) {
            if (!file.endsWith('.md') || file.startsWith('_'))
                continue;
            const filePath = path.join(categoryPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const links = extractWikiLinks(content);
            for (const link of links) {
                let resolved = resolveLinkToPath(link);
                if (!resolved) {
                    // fallback：全库 stem 匹配（与提取器 doc id 语义对齐）
                    const stem = link.split('/').pop();
                    resolved = stemIndex.get(stem) || null;
                }
                if (!resolved) {
                    brokenLinks.push({
                        source: path.join(category, file),
                        target: link,
                    });
                    count++;
                    // Limit to 20 for report
                    if (brokenLinks.length >= 20) {
                        return count;
                    }
                }
            }
        }
    }
    return count;
}
// ============================================================================
// Graph Freshness
// ============================================================================
/**
 * 检查图谱新鲜度
 */
function checkGraphFreshness() {
    const graphPath = path.join(WIKI_ROOT, 'graphify-out', 'graph.json');
    if (!fs.existsSync(graphPath)) {
        return { stale: true, reason: '图谱文件不存在' };
    }
    // Read graph metadata
    try {
        const graphContent = fs.readFileSync(graphPath, 'utf-8');
        const graph = JSON.parse(graphContent);
        // Check if graph has build timestamp
        const buildTime = graph.buildTime ? new Date(graph.buildTime) : null;
        if (!buildTime) {
            return { stale: true, reason: '图谱缺少构建时间戳' };
        }
        // Check if any wiki file is newer than graph
        const graphMtime = fs.statSync(graphPath).mtime;
        for (const category of WIKI_CATEGORIES) {
            const categoryPath = path.join(WIKI_ROOT, category);
            if (!fs.existsSync(categoryPath))
                continue;
            const files = fs.readdirSync(categoryPath);
            for (const file of files) {
                if (!file.endsWith('.md') || file.startsWith('_'))
                    continue;
                const filePath = path.join(categoryPath, file);
                const fileMtime = fs.statSync(filePath).mtime;
                if (fileMtime > graphMtime) {
                    return {
                        stale: true,
                        reason: `条目 ${path.join(category, file)} 比图谱更新`
                    };
                }
            }
        }
        return { stale: false, reason: '' };
    }
    catch (error) {
        return {
            stale: true,
            reason: `图谱解析失败: ${error.message}`
        };
    }
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * 格式化健康报告
 */
export function formatHealthReport(result) {
    const lines = [];
    lines.push('='.repeat(50));
    lines.push('Wiki 健康检查报告');
    lines.push('='.repeat(50));
    // Core files
    lines.push('\n## 核心文件检查');
    if (result.coreFilesOk) {
        lines.push('✅ 所有核心文件存在');
    }
    else {
        lines.push(`❌ 缺失文件: ${result.missingFiles.join(', ')}`);
    }
    // Broken links
    lines.push('\n## 坏链检测');
    if (result.brokenLinkCount === 0) {
        lines.push('✅ 无坏链');
    }
    else {
        lines.push(`❌ 发现 ${result.brokenLinkCount} 个坏链`);
        for (const link of result.brokenLinks) {
            lines.push(`   - ${link.source} → ${link.target}`);
        }
        if (result.brokenLinkCount > result.brokenLinks.length) {
            lines.push(`   ... 还有 ${result.brokenLinkCount - result.brokenLinks.length} 个`);
        }
    }
    // Graph freshness
    lines.push('\n## 图谱新鲜度');
    if (!result.graphStale) {
        lines.push('✅ 图谱是最新的');
    }
    else {
        lines.push(`⚠️  图谱过期: ${result.graphStaleReason}`);
    }
    // Overall
    lines.push('\n## 总体状态');
    if (result.healthy) {
        lines.push('✅ Wiki 健康状态良好');
    }
    else {
        lines.push('❌ Wiki 存在问题，建议运行修复命令');
    }
    return lines.join('\n');
}
//# sourceMappingURL=wiki-doctor.js.map