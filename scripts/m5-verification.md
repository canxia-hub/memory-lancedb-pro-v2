# M5 验证报告

> 日期：2026-07-31
> 插件：memory-lancedb-pro v3
> 分支：v4-dev

## 1. Vitest 全绿

```
Test Files  8 passed (8)
     Tests  199 passed (199)
  Duration  5.81s
```

- 既有 176 测试无回归
- 新增 23 doctor 测试（schema-helpers 8 + legacy envelope 6 + integration 5 + storageOptions 3 + edge case 1）
- 测试文件：`tests/doctor.test.ts`

## 2. Doctor 污染扫描（tmp-m5-test-db）

### Dry-run 扫描
- 注入 3 条污染行后扫描
- 发现 122 条污染行（119 条历史欠账 + 3 条注入）
- 污染类型：legacy envelope sentinel lines（Conversation info/Sender/Thread starter 等 10 类）

### --fix 批量删除
- batch=500，一次性删除全部 122 条
- 验证删除后剩余污染行：0 ✅

### 额外发现
- Assets 表 schema 缺少必需列（id, memory_id, mime_type, storage_path, created_at）——历史 legacy 表结构差异，非阻塞
- FTS 索引：present ✅
- Embedding 维度：2560 ✅

### 脚本
- `scripts/m5-doctor-scan.mjs` — 完整注入→扫描→修复→验证流程

## 3. storageOptions

### ${VAR} 插值单测
- `TEST_STORAGE_KEY` 环境变量正确展开 ✅
- 缺失环境变量抛错 ✅
- 不提供 storageOptions 时返回 undefined ✅

### embedded 模式 warn
- `lancedb-store.js` 中：embedded 模式 + 本地路径 + storageOptions → `console.warn('[memory-lancedb-pro] storageOptions ignored in embedded mode (local path)')`
- 不报错，不阻塞初始化 ✅

### manifest configSchema
- `openclaw.plugin.json` 新增 `storageOptions` 字段 ✅

## 4. 延迟激活评估

- 评估报告：`scripts/m5-lazy-activation-assessment.md`
- 结论：**不采纳延迟激活**
- 理由：
  1. 同步 init 耗时 ~15ms，不阻塞网关
  2. M2 auto-recall hook 依赖 `before_prompt_build` 事件，与懒加载时序互斥
  3. 延迟激活会导致 M2/M3/M4 核心功能全部失效
  4. 当前已通过 fire-and-forget 实现 DB 延迟连接

## 5. 文件变更清单

### 新增
- `dist/doctor/schema-helpers.js` — SQL 转义、schema 校验工具
- `dist/doctor/contract.js` — Doctor 契约：污染扫描 + schema 校验 + fix
- `dist/doctor/cli.js` — Doctor CLI 命令（scan/fix 子命令）
- `tests/doctor.test.ts` — 23 个测试
- `scripts/m5-probe-schema.mjs` — Schema 探针脚本
- `scripts/m5-doctor-scan.mjs` — Doctor 污染扫描验证脚本
- `scripts/m5-lazy-activation-assessment.md` — 延迟激活评估报告
- `scripts/m5-verification.md` — 本文件

### 修改
- `dist/index.js` — 导入 + 注册 doctor CLI
- `dist/config/resolve-config.js` — storageOptions 解析（${ENV_VAR} 插值）
- `dist/store/lancedb-store.js` — storageOptions 透传至 lancedb.connect + embedded warn
- `openclaw.plugin.json` — configSchema 新增 storageOptions 字段

## 6. SDK 降级说明

- 探测 `openclaw/plugin-sdk/runtime-doctor`：可用但无 `PluginDoctorStateMigration` 导出
- 降级为 CLI 命令（`doctor scan` / `doctor fix`），功能等价
- 通过 `api.registerCli` 注册，不依赖 SDK doctor 契约
