/**
 * Wiki Sync Links - 反向链接同步
 *
 * 对照 Python wiki-sync-links.py 实现
 */
/**
 * 提取文档中的 Wiki 链接（对照 Python wiki-sync-links.py extract_links）
 *
 * Pattern: [[target]] or [[target|display]]
 */
export declare function extractWikiLinks(content: string): string[];
/**
 * 同步所有反向链接（对照 Python wiki-sync-links.py main）
 *
 * @returns 更新的文档数量
 */
export declare function syncBacklinks(): Promise<number>;
//# sourceMappingURL=wiki-sync-links.d.ts.map