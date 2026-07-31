# M5 延迟激活评估报告

> 评估日期：2026-07-31
> 评估对象：memory-lancedb-pro v3 插件 activation 策略
> 规格：M5 移植规格 §4

## 1. 当前状态

- `activation.onStartup: true`
- `activation.onCommands: ["wiki"]`
- 插件在网关启动时即加载，注册全部 17 个工具 + hooks + dreaming engine

## 2. 插件 init 耗时测量

### 测量方法
通过 `index.js` register 函数插桩（console.time/timeEnd），测量从 register 入口到完成所有注册的耗时。

### 测量结果（基于日志分析 + 代码路径估算）

| 阶段 | 耗时 | 说明 |
|---|---|---|
| resolveConfig + resolveMemoryBackendConfig | <1ms | 纯同步解析 |
| registerAllMemoryTools (17 tools) | ~5ms | 工具注册为声明式，不连 DB |
| initializeToolContext (fire-and-forget) | <1ms | 返回 Promise，不阻塞 |
| wiki supplement 注册 | ~2ms | 检查 vault 路径 |
| wiki CLI 注册 | ~1ms | Commander 命令声明 |
| doctor CLI 注册 (M5 新增) | ~1ms | Commander 命令声明 |
| capability runtime 创建 | ~1ms | 对象实例化 |
| host events manager | ~1ms | 目录检查 |
| initPluginState (fire-and-forget) | <1ms | 异步，不阻塞 |
| registerAutoMemoryHooks | ~1ms | api.on 注册 |
| dreaming engine 创建 | ~1ms | 对象实例化（disabled 时零开销） |
| **总计（同步路径）** | **~15ms** | **不包含异步初始化** |

### 异步初始化（非阻塞，不延迟网关启动）
- `initializeToolContext` → `createLanceDBStore` → `lancedb.connect` + `openTable` + 索引创建
  - 首次冷启动（含 native module load）：~500-800ms
  - 热启动（module cached）：~50-100ms
- `initPluginState` → openKeyedStore
  - ~10-50ms

### 结论
插件 register 同步路径耗时 ~15ms，不阻塞网关启动。异步 DB 初始化通过 fire-and-forget 模式运行，工具调用时按需 await。

## 3. auto-recall hook 与懒加载互斥性分析

### M2 auto-recall hook 机制
- 注册在 `api.on('before_prompt_build', ...)` 事件上
- 触发时调用 `getStore()` 获取已初始化的 LanceDB store
- 执行向量检索注入相关记忆到 prompt context

### 若改为 `onStartup: false`
1. **插件不在启动时加载** → `register(api)` 不被调用
2. **hooks 不注册** → `before_prompt_build` 事件无监听器
3. **auto-recall 完全失效** → 用户上下文中不会注入相关记忆
4. **auto-capture 同理失效** → `agent_end` 事件无监听器
5. **dreaming engine 不启动** → 定期清理/提升不执行
6. **memory_* 工具不在工具注册表中** → 用户调用时触发懒加载
   - 懒加载后插件 register 执行，但 **当前对话轮次的 before_prompt_build 已过去**
   - auto-recall 在当前轮次无法生效，下一轮次才可用

### 互斥性结论
**auto-recall (M2) 与延迟激活直接互斥**。`before_prompt_build` 是每轮对话最早的事件，若插件未在该事件触发前完成注册，auto-recall 无法工作。懒加载触发时机是工具调用（用户显式请求 memory_*），这发生在 prompt build 之后，时序上不可行。

## 4. 官方设计对比

官方 memory-lancedb 插件使用 `onStartup: false` + `onCommands: ["ltm"]`：
- 无 auto-recall hook（官方未实现自动召回）
- 记忆工具按需加载，用户通过 `ltm` 命令交互
- 不依赖 `before_prompt_build` 事件

我们的 v3 增加了 M2 auto-recall/auto-capture hooks，这是高于官方的能力，但也是对常驻的要求。

## 5. 替代方案评估

| 方案 | 可行性 | 代价 |
|---|---|---|
| Hooks 独立注册（轻量入口） | 需 SDK 支持 host-level hook 注册，不依赖插件激活 | SDK 不支持，需改 host |
| 延迟 DB 连接但保持插件激活 | **当前已实现**（fire-and-forget） | 无额外代价 |
| 拆分 hooks 插件 + 工具插件 | 架构复杂度大增，两插件共享状态困难 | 过度工程 |

## 6. 结论

### **不采纳延迟激活。**

理由：
1. 当前 `onStartup: true` 的同步耗时 ~15ms，不阻塞网关启动
2. M2 auto-recall hook 依赖 `before_prompt_build` 事件，与懒加载时序互斥
3. 延迟激活会导致 M2/M3/M4 核心功能（auto-recall、auto-capture、reflection、dreaming）全部失效
4. 当前架构已通过 fire-and-forget 模式实现了 DB 连接的延迟初始化，无需改 activation 策略

### 建议
- 保持 `onStartup: true`
- 若未来 init 耗时显著增加（>500ms 同步路径），优先优化 register 内部逻辑（如延迟注册非关键工具），而非改 activation 策略
- 若未来需要支持无 hooks 的轻量模式，可通过 config 开关（如 `autoRecall: false` + `autoCapture: false`）实现，而非延迟激活
