# M1 存储底座迁移 · 运行时验证报告

> 执行：m1_lancedb_migration（Phase A-C）+ 主线程补全（Phase D 与两处硬伤修复）
> 日期：2026-07-31 ｜ 结果：**12/12 smoke PASS + vitest 49/49 PASS**

## 1. 范围与红线复核

- ✅ 生产库 `memory\memory-lancedb-pro-v2` 未触碰（LastWriteTime 2026-07-30 02:05，早于 M1 开工；备份于 `memory\backups\memory-lancedb-pro-v2-20260731-0615`，25MB）
- ✅ openclaw.json 未改、Gateway 未重启
- ✅ 所有验证在副本 `memory\tmp-m1-test-db` 与全新库 `tmp-m1-smoke-db` 上进行

## 2. 依赖升级

- `@lancedb/lancedb` 0.4.20 → **0.33.0**（win32-x64-msvc 原生绑定 272MB 已就位）
- 新增 `apache-arrow 18.1.0`（peer 依赖，与官方一致）
- ⚠️ 过程事故：sub-agent 的 npm 与 Gateway 持有的原生绑定文件锁冲突，残留损坏文件；主线程清杀残留 npm 进程（PID 4492）+ 删平台包重装后恢复。教训记入风险登记。

## 3. Breaking 适配验证

| 项 | 验证方式 | 结果 |
|---|---|---|
| 0.33 打开 0.4 数据 | 副本打开，行数比对 | ✅ 763 行一致，2560 维正常 |
| where() 多次调用 AND 语义 | test-where-and.mjs | ✅ id∧scope=1、id∧错scope=0（顺带修复了 0.4 下第二个 where 覆盖第一个的旧 bug） |
| add/delete 返回值对象 | test-return-values.mjs | ✅ AddResult{version} / DeleteResult{numDeletedRows} |

## 4. 主线程补全的两处硬伤（sub-agent 遗漏）

1. **向量列类型**：0.4 建表路径（schemaRow 类型推断）产出 `List<Float64>`，0.33 只认 `FixedSizeList<Float32>` 为向量列 → vectorSearch 全灭。
   - 修复：lancedb-store.js / asset-store.js 改用 apache-arrow Schema + `createEmptyTable`；遗留表检测 + 警告降级；新增 `scripts/migrate-v4-vector-schema.mjs`（干跑/apply 双模式，含行数校验、非零范数向量自搜验证、索引重建）
   - 副本迁移验证：memories 764 行 + memory_assets 14 行全部迁移，向量自搜 topMatch=true
   - ⚠️ renameTable 在 LanceDB OSS 不支持 → 迁移收尾走文件系统目录换名（旧表保留为 *_legacy_v3 回滚）
2. **FTS 中文分词**：默认 simple tokenizer 不切 CJK → 中文 FTS 零命中；jieba 需外部语言模型（本机不可用）。
   - 修复：探针实测 `icu`/`icu/split`/`ngram` 三种内置分词器后选定 **icu**（中英双语命中）
   - lancedb-store.js 与迁移脚本 FTS 配置统一为 `baseTokenizer: 'icu', stem:false, removeStopWords:false`

## 5. Phase D smoke 全量结果（m1-smoke.mjs，12/12 PASS）

| 测试 | 结果 |
|---|---|
| A0-A5 全新库 CRUD + mergeInsert 更新 + 跨连接可见 + 删除 | ✅ 全过 |
| B0 迁移后副本状态 | ✅ 764 行、2560 维、ftsAvailable=true |
| B1 FTS 中文搜索（"沧溟剑诀"） | ✅ hits=2，top 为测试行 |
| B2 cosine 原生向量自搜 | ✅ hits=3，topIdMatch=true，dist=0 |
| B3 bench-after vectorSearch | p50=20.2ms p95=31.6ms（暴力余弦，未建向量索引） |
| C1/C2 双进程并发各写 20 条 | ✅ 无冲突，P1=20 P2=20 |

## 6. 数据质量发现（非阻塞）

- 生产库存在 **18/764 条零范数 embedding**（0.4 时代遗留，cosine 检索天然不召回）→ 建议后续重嵌入清理，已记入 current-task risks
- bench 对比说明：0.4.20 的 p50=0.4ms 是暴力扫描小缓存路径，0.33 暴力余弦 p50≈20ms（764×2560 全量计算）；后续可按需建 IVF_PQ 索引进一步优化，当前数据量下暴力搜索足够

## 7. vitest

- 49/49 PASS（含 manifest 测试期望从 17 → 18 tools 修正：M1 发现 memory_forget 早已实现但未注册进 contracts，已补注册）

## 8. 遗留事项

- 生产库迁移（migrate-v4-vector-schema.mjs --apply + 目录换名）留待 M7 随 Gateway 重启一同执行
- `memories_legacy_v3` / `memory_assets_legacy_v3` 回滚表在副本验证通过后，生产迁移时同样保留
