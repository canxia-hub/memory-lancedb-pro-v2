# M6 Verification Report

**Date**: 2026-07-31
**Task**: M6 Wiki 系统升级 P0 阶段（主动注入链路打通）

## 1. vitest 全绿

```
Test Files  9 passed (9)
     Tests  217 passed (217)  ← 199 原有 + 18 新增 wiki-digest 测试
  Duration  10.33s
```

## 2. Digest 编译器对真实 vault 跑一轮

- **agent-digest.json 已生成**: `<WIKI_ROOT>/.openclaw-wiki/cache/agent-digest.json`
- **格式与官方一致**: claimCount, pages[{title, kind, claimCount, topClaims, questions, contradictions}], contradictionClusters, compiledAt
- **Claims 非空**: 142 pages scanned, 709 total claims, 4 pages in digest
- **MAX_PAGES=4, MAX_CLAIMS_PER_PAGE=2**: 遵守官方常量
- **Freshness 分级**: fresh/aging/stale 三级正确计算

## 3. Wiki 知识命中验证

- **Search '飞书多账号'**: 3 results, top hit = 飞书多账号路由配置 (score 10) ✅
- **Search '作画密度'**: 3 results, top hit = 04_制作成本与作画密度评估模型 (score 10) ✅
- 这些知识只存在于 wiki，不在 durable memory 中

## 4. includeCompiledDigestPrompt 开启后 prompt section 非空

- **Section lines**: 23
- **Has Wiki Snapshot**: true
- **Has claims count**: true
- **Tool guidance**: 包含 memory_recall / wiki_query / wiki_build / wiki_doctor 指引

## 5. Supplement 注册验证

- **registerMemoryPromptSupplement**: 存在于 host api-builder (L103, L186) ✅
- **registerMemoryCorpusSupplement**: 存在于 host api-builder (L104, L187) ✅
- **Host 自动合并**: buildMemoryPromptSection 自动合并 prompt supplements (memory-state L58-62) ✅
- **Host 自动合并**: searchMemoryCorpusSupplements 在 memory_recall 中合并 corpus results (tools L266-273, L664-675) ✅
- **无需修改 auto-memory.js**: host 已在工具层和提示层自动合并

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `dist/wiki/digest-compiler.js` | 新增 | Digest 编译器核心模块 |
| `dist/wiki/wiki-supplement.js` | 重写 | Vault-path-independent 化，消除 WIKI_ROOT 硬依赖 |
| `dist/wiki/index.js` | 修改 | 导出 digest-compiler |
| `dist/wiki/probe-supplement-registration.mjs` | 新增 | P0a-1 探针脚本 |
| `dist/tools/wiki-tools.js` | 修改 | wiki_build/wiki_index 自动编译 digest |
| `tests/wiki-digest.test.ts` | 新增 | 18 个测试用例 |

## 遗留项

1. **includeCompiledDigestPrompt 默认 false**: 需用户/主线程决定是否开启（digest 注入是只读增强，风险低，建议开启）
2. **P1 向量检索**: wiki 页面 embedding 入 LanceDB，混合检索（本次不做）
3. **Digest 自动刷新**: 当前需 wiki_build/wiki_index 触发，未来可加 mtime 检测自动刷新
