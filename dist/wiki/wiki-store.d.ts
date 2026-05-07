/**
 * Wiki Store - Wiki 数据存取层
 *
 * 对照 Python 实现：
 * - wiki_common.py: WIKI_ROOT, normalize_link_target, resolve_link_to_path
 * - wiki-new.py: slugify, create_entry, sync_after_write
 */
import { WikiCategory, WikiEntry, WikiFrontMatter, WikiEntryStatus } from './types.js';
/**
 * Wiki root directory - 可通过环境变量 WIKI_ROOT 覆盖
 */
export declare const WIKI_ROOT: string;
/**
 * 标题转 slug（对照 Python wiki-new.py slugify）
 *
 * Python 实现:
 *   slug = text.lower()
 *   slug = re.sub(r"[^\w\s-]", "", slug)
 *   slug = re.sub(r"[\s_]+", "-", slug)
 *   return slug.strip("-")
 */
export declare function slugify(text: string): string;
/**
 * Normalize link target (对照 Python wiki_common.py normalize_link_target)
 */
export declare function normalizeLinkTarget(target: string): string;
/**
 * Resolve link to absolute path (对照 Python wiki_common.py resolve_link_to_path)
 */
export declare function resolveLinkToPath(target: string): string | null;
/**
 * 解析 YAML Front Matter（对照 Python wiki-index.py parse_frontmatter）
 *
 * 格式:
 * ---
 * title: ...
 * category: ...
 * tags: ["tag1", "tag2"]
 * status: draft
 * ---
 */
export declare function parseFrontMatter(content: string): WikiFrontMatter | null;
/**
 * 序列化 Front Matter 为 YAML（对照 Python wiki-new.py 模板替换）
 */
export declare function serializeFrontMatter(fm: WikiFrontMatter): string;
/**
 * 列出所有分类及其条目计数
 */
export declare function listCategories(): Record<WikiCategory, number>;
/**
 * 读取 Wiki 条目
 */
export declare function getEntry(relativePath: string): WikiEntry | null;
/**
 * 创建 Wiki 条目（对照 Python wiki-new.py create_entry）
 *
 * 创建后自动触发 sync + index
 */
export declare function createEntry(category: WikiCategory, title: string, options?: {
    tags?: string[];
    status?: WikiEntryStatus;
    agent?: string;
    confidence?: number;
}): Promise<string>;
/**
 * 更新 Wiki 条目正文
 */
export declare function updateEntry(relativePath: string, content: string): Promise<void>;
/**
 * 删除 Wiki 条目
 */
export declare function deleteEntry(relativePath: string): Promise<boolean>;
//# sourceMappingURL=wiki-store.d.ts.map