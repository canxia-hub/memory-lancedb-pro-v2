/**
 * Wiki Sync Links - 反向链接同步
 *
 * 对照 Python wiki-sync-links.py 实现
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_CATEGORIES, } from './types.js';
import { WIKI_ROOT, normalizeLinkTarget, resolveLinkToPath, } from './wiki-store.js';
// ============================================================================
// Constants (对照 Python wiki-sync-links.py)
// ============================================================================
const START = '<!-- AUTO-BACKLINKS:START -->';
const END = '<!-- AUTO-BACKLINKS:END -->';
const HEADER = '## 反向链接';
const EXCLUDE_DIRS = ['templates', 'graphify-out', '__pycache__'];
// ============================================================================
// Extract Wiki Links
// ============================================================================
/**
 * 提取文档中的 Wiki 链接（对照 Python wiki-sync-links.py extract_links）
 *
 * Pattern: [[target]] or [[target|display]]
 */
export function extractWikiLinks(content) {
    const pattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const links = [];
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const target = normalizeLinkTarget(match[1]);
        links.push(target);
    }
    return links;
}
// ============================================================================
// List All Docs
// ============================================================================
/**
 * 列出所有 Wiki 文档（对照 Python wiki-sync-links.py list_docs）
 */
function listAllDocs() {
    const docs = [];
    for (const category of WIKI_CATEGORIES) {
        const categoryPath = path.join(WIKI_ROOT, category);
        if (!fs.existsSync(categoryPath))
            continue;
        const files = fs.readdirSync(categoryPath);
        for (const file of files) {
            if (!file.endsWith('.md') || file.startsWith('_'))
                continue;
            docs.push(path.join(category, file));
        }
    }
    return docs;
}
// ============================================================================
// Relative Wiki Reference
// ============================================================================
/**
 * 获取相对 Wiki 引用路径（对照 Python wiki-sync-links.py relative_wiki_ref）
 */
function relativeWikiRef(absolutePath) {
    const relPath = path.relative(WIKI_ROOT, absolutePath);
    return relPath.replace(/\.md$/, '').replace(/\\/g, '/');
}
// ============================================================================
// Inject Backlinks
// ============================================================================
/**
 * 注入反向链接块（对照 Python wiki-sync-links.py inject_backlinks）
 */
function injectBacklinks(content, backlinks) {
    // Build backlink block
    const blockLines = [Header, START];
    if (backlinks.length > 0) {
        for (const link of backlinks) {
            blockLines.push(`- [[${link}]]`);
        }
    }
    else {
        blockLines.push('- （暂无）');
    }
    blockLines.push(END);
    const block = blockLines.join('\n');
    // Check if backlink block already exists
    const pattern = new RegExp(`\n?${escapeRegex(Header)}\n${escapeRegex(START)}.*?${escapeRegex(END)}`, 's');
    if (pattern.test(content)) {
        // Replace existing block
        return content.replace(pattern, '\n' + block);
    }
    // Append new block
    const stripped = content.trimEnd();
    return stripped + '\n\n' + block + '\n';
}
/**
 * Escape regex special characters
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ============================================================================
// Sync Backlinks
// ============================================================================
/**
 * 同步所有反向链接（对照 Python wiki-sync-links.py main）
 *
 * @returns 更新的文档数量
 */
export async function syncBacklinks() {
    const docs = listAllDocs();
    const incoming = new Map();
    // Build incoming link map
    for (const sourceRelPath of docs) {
        const sourceFullPath = path.join(WIKI_ROOT, sourceRelPath);
        const content = fs.readFileSync(sourceFullPath, 'utf-8');
        const links = extractWikiLinks(content);
        for (const target of links) {
            const targetFullPath = resolveLinkToPath(target);
            if (targetFullPath && targetFullPath !== sourceFullPath) {
                const sourceRef = relativeWikiRef(sourceFullPath);
                if (!incoming.has(targetFullPath)) {
                    incoming.set(targetFullPath, new Set());
                }
                incoming.get(targetFullPath).add(sourceRef);
            }
        }
    }
    // Inject backlinks into each document
    let updateCount = 0;
    for (const docRelPath of docs) {
        const docFullPath = path.join(WIKI_ROOT, docRelPath);
        const content = fs.readFileSync(docFullPath, 'utf-8');
        const backlinks = Array.from(incoming.get(docFullPath) || new Set()).sort();
        const updated = injectBacklinks(content, backlinks);
        if (updated !== content) {
            fs.writeFileSync(docFullPath, updated, 'utf-8');
            updateCount++;
        }
    }
    return updateCount;
}
// ============================================================================
// Header constant (exported for testing)
// ============================================================================
const Header = HEADER;
//# sourceMappingURL=wiki-sync-links.js.map