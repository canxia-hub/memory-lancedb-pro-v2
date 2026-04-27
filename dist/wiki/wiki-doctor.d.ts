/**
 * Wiki Doctor - Wiki 健康检查
 *
 * 对照 Python wiki_ops.py doctor 功能
 */
import { WikiHealthResult } from './types.js';
/**
 * 检查 Wiki 健康状态
 *
 * 检查项:
 * 1. 核心文件存在性（INDEX.md, 各分类 _INDEX.md）
 * 2. 坏链检测（[[wikilinks]] 指向不存在的目标）
 * 3. 图谱新鲜度（graph.json 是否过期）
 */
export declare function checkWikiHealth(): Promise<WikiHealthResult>;
/**
 * 格式化健康报告
 */
export declare function formatHealthReport(result: WikiHealthResult): string;
//# sourceMappingURL=wiki-doctor.d.ts.map