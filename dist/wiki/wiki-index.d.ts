/**
 * Wiki Index - 分类索引与标签索引生成
 *
 * 对照 Python wiki-index.py 实现
 */
import { WikiCategory, WikiCategoryIndex } from './types.js';
/**
 * 扫描分类目录，构建索引（对照 Python wiki-index.py scan_wiki）
 */
export declare function buildCategoryIndex(category: WikiCategory): Promise<WikiCategoryIndex>;
/**
 * 重建所有分类索引（对照 Python wiki-index.py main）
 */
export declare function buildAllIndexes(): Promise<void>;
/**
 * 生成标签索引
 */
export declare function buildTagIndex(): Promise<Record<string, string[]>>;
/**
 * 更新主 INDEX.md（对照 Python wiki-index.py generate_main_index）
 */
export declare function updateMainIndex(): Promise<void>;
//# sourceMappingURL=wiki-index.d.ts.map