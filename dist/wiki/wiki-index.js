/**
 * Wiki Index - 分类索引与标签索引生成
 *
 * 对照 Python wiki-index.py 实现
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_CATEGORIES, } from './types.js';
import { WIKI_ROOT, parseFrontMatter, } from './wiki-store.js';
// ============================================================================
// Category Names (对照 Python wiki-index.py)
// ============================================================================
const CATEGORY_NAMES = {
    concepts: '概念库',
    decisions: '决策库',
    procedures: '流程库',
    references: '参考资料库',
    snippets: '代码片段库',
};
const CATEGORY_DESCRIPTIONS = {
    concepts: '记录术语、概念定义、核心知识',
    decisions: '记录重要决策及其理由',
    procedures: '记录操作流程、工作流程、标准程序',
    references: '记录外部资料整理、文档摘要',
    snippets: '记录常用代码片段、命令模板',
};
// ============================================================================
// Build Category Index
// ============================================================================
/**
 * 扫描分类目录，构建索引（对照 Python wiki-index.py scan_wiki）
 */
export async function buildCategoryIndex(category) {
    const entries = [];
    const categoryPath = path.join(WIKI_ROOT, category);
    if (!fs.existsSync(categoryPath)) {
        return { category, entries };
    }
    const files = fs.readdirSync(categoryPath);
    for (const file of files) {
        if (!file.endsWith('.md') || file.startsWith('_'))
            continue;
        const filePath = path.join(categoryPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontMatter(content);
        if (!fm)
            continue;
        const entry = {
            file,
            title: fm.title,
            tags: fm.tags || [],
            status: fm.status || 'draft',
            updated: fm.updated || fm.created,
            agent: fm.agent,
        };
        entries.push(entry);
    }
    // Sort by updated time (descending)
    entries.sort((a, b) => {
        if (!a.updated)
            return 1;
        if (!b.updated)
            return -1;
        return b.updated.localeCompare(a.updated);
    });
    return { category, entries };
}
/**
 * 生成分类索引 Markdown（对照 Python wiki-index.py generate_category_index）
 */
function generateCategoryIndexMarkdown(index) {
    const lines = [];
    lines.push(`# ${CATEGORY_NAMES[index.category]}`);
    lines.push('');
    lines.push(`> ${CATEGORY_DESCRIPTIONS[index.category]}`);
    lines.push('');
    lines.push('## 条目列表');
    lines.push('');
    lines.push('| 标题 | 标签 | 更新时间 | 状态 |');
    lines.push('|------|------|----------|------|');
    for (const entry of index.entries) {
        const tagsStr = entry.tags.slice(0, 3).map(t => `#${t}`).join(' ');
        const dateStr = entry.updated ? entry.updated.slice(0, 10) : '-';
        lines.push(`| [${entry.title}](./${entry.file}) | ${tagsStr} | ${dateStr} | ${entry.status} |`);
    }
    // Group by tags (对照 Python 按标签分组)
    if (index.entries.length > 0) {
        lines.push('');
        lines.push('## 按标签分组');
        lines.push('');
        const tagMap = {};
        for (const entry of index.entries) {
            for (const tag of entry.tags) {
                if (!tagMap[tag])
                    tagMap[tag] = [];
                tagMap[tag].push(entry);
            }
        }
        for (const tag of Object.keys(tagMap).sort()) {
            lines.push(`### #${tag}`);
            for (const entry of tagMap[tag]) {
                lines.push(`- [${entry.title}](./${entry.file})`);
            }
            lines.push('');
        }
    }
    lines.push('---');
    lines.push('');
    lines.push(`**创建新条目**：使用 \`/wiki new ${index.category} <title>\``);
    return lines.join('\n');
}
// ============================================================================
// Build All Indexes
// ============================================================================
/**
 * 重建所有分类索引（对照 Python wiki-index.py main）
 */
export async function buildAllIndexes() {
    for (const category of WIKI_CATEGORIES) {
        const index = await buildCategoryIndex(category);
        const markdown = generateCategoryIndexMarkdown(index);
        const indexPath = path.join(WIKI_ROOT, category, '_INDEX.md');
        fs.writeFileSync(indexPath, markdown, 'utf-8');
    }
}
// ============================================================================
// Tag Index
// ============================================================================
/**
 * 生成标签索引
 */
export async function buildTagIndex() {
    const tagMap = {};
    for (const category of WIKI_CATEGORIES) {
        const index = await buildCategoryIndex(category);
        for (const entry of index.entries) {
            for (const tag of entry.tags) {
                const key = `${category}/${entry.file}`;
                if (!tagMap[tag])
                    tagMap[tag] = [];
                tagMap[tag].push(key);
            }
        }
    }
    return tagMap;
}
// ============================================================================
// Main Index
// ============================================================================
/**
 * 更新主 INDEX.md（对照 Python wiki-index.py generate_main_index）
 */
export async function updateMainIndex() {
    const lines = [];
    // Header
    lines.push('# OpenClaw Wiki 知识库');
    lines.push('');
    lines.push('> 团队共享的外部记忆 — 记录知识碎片，发现隐藏关联');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 快速导航');
    lines.push('');
    lines.push('### 按类别');
    lines.push('');
    lines.push('| 类别 | 说明 | 条目数 |');
    lines.push('|------|------|--------|');
    // Category counts
    const counts = {
        concepts: 0,
        decisions: 0,
        procedures: 0,
        references: 0,
        snippets: 0,
    };
    for (const category of WIKI_CATEGORIES) {
        const index = await buildCategoryIndex(category);
        counts[category] = index.entries.length;
        lines.push(`| [${CATEGORY_NAMES[category]}](./${category}/_INDEX.md) | ${CATEGORY_DESCRIPTIONS[category]} | ${index.entries.length} |`);
    }
    lines.push('');
    lines.push('### 按标签');
    lines.push('');
    // Tag cloud
    const tagMap = await buildTagIndex();
    const sortedTags = Object.keys(tagMap).sort();
    for (const tag of sortedTags.slice(0, 20)) {
        lines.push(`\`#${tag}\` (${tagMap[tag].length}) `);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 知识图谱');
    lines.push('');
    lines.push('> 基于 Markdown 提取器构建的知识关联网络');
    lines.push('');
    lines.push('- [查看图谱可视化](graphify-out/graph.html)');
    lines.push('- [图谱分析报告](graphify-out/GRAPH_REPORT.md)');
    lines.push('');
    lines.push('**构建命令**：');
    lines.push('- `python wiki-build-graph.py` — 构建知识图谱');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 最近更新');
    lines.push('');
    lines.push('| 日期 | 条目 | 操作 |');
    lines.push('|------|------|------|');
    // Recent updates (top 10)
    const allEntries = [];
    for (const category of WIKI_CATEGORIES) {
        const index = await buildCategoryIndex(category);
        for (const entry of index.entries) {
            allEntries.push({ category, entry });
        }
    }
    allEntries.sort((a, b) => {
        if (!a.entry.updated)
            return 1;
        if (!b.entry.updated)
            return -1;
        return b.entry.updated.localeCompare(a.entry.updated);
    });
    const recent = allEntries.slice(0, 10);
    for (const item of recent) {
        const dateStr = item.entry.updated ? item.entry.updated.slice(0, 10) : '-';
        lines.push(`| ${dateStr} | [${item.entry.title}](./${item.category}/${item.entry.file}) | 更新 |`);
    }
    if (recent.length === 0) {
        lines.push('| *(暂无更新)* | | |');
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 统计');
    lines.push('');
    const totalEntries = Object.values(counts).reduce((a, b) => a + b, 0);
    const totalTags = sortedTags.length;
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    lines.push(`- **总条目数**: ${totalEntries}`);
    lines.push(`- **总标签数**: ${totalTags}`);
    lines.push(`- **最后更新**: ${now}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 使用指南');
    lines.push('');
    lines.push('### 创建新条目');
    lines.push('');
    lines.push('```');
    lines.push('/wiki new <category> <title>');
    lines.push('');
    lines.push('示例：');
    lines.push('/wiki new concepts memory-system');
    lines.push('/wiki new decisions 2026-04-11-feishu-multi-account');
    lines.push('```');
    lines.push('');
    lines.push('### 维护命令');
    lines.push('');
    lines.push('```');
    lines.push('python wiki-build-graph.py   # 构建知识图谱');
    lines.push('python wiki-index.py         # 更新所有索引');
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`**创建时间**：2026-04-11`);
    lines.push(`**最后更新**：${new Date().toISOString().slice(0, 10)}`);
    const indexPath = path.join(WIKI_ROOT, 'INDEX.md');
    fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
}
//# sourceMappingURL=wiki-index.js.map