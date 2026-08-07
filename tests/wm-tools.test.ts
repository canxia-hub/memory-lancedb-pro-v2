/**
 * memory_wm_* tools tests — factory lane binding, isolation, admin delegation.
 * Real temp LanceDB via initializeWorkingMemoryStore singleton.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempDbPath, removeTempDbPath } from "./setup.js";

let wmStoreMod;
let wmToolsMod;
let dbPath;

const PLUGIN_CONFIG = {
  defaultScope: "default",
  workingMemory: { enabled: true, tableName: "wm_tools_test", crossAgentWriteAllowlist: ["main"] },
};

/** 模拟宿主 registerTool：捕获工厂并返回可调用句柄 */
function makeHost() {
  const registrations = new Map();
  const registerTool = (factory, opts) => {
    registrations.set(opts.name, factory);
  };
  const adapt = (tool) => ({
    ...tool,
    execute: async (...args) => {
      const candidate = typeof args[0] === "string" && args[1] !== undefined ? args[1] : args[0];
      return tool.execute(candidate && typeof candidate === "object" ? candidate : {});
    },
  });
  const resolve = (name, ctx) => registrations.get(name)?.(ctx) ?? null;
  return { registerTool, adapt, resolve, registrations };
}

let host;

beforeAll(async () => {
  dbPath = createTempDbPath();
  wmStoreMod = await import("../dist/store/working-memory-store.js");
  wmToolsMod = await import("../dist/tools/wm-tools.js");
  await wmStoreMod.initializeWorkingMemoryStore({ dbPath }, PLUGIN_CONFIG);
  host = makeHost();
  wmToolsMod.registerWmTools(host.registerTool, { getConfig: () => PLUGIN_CONFIG, adapt: host.adapt });
});

afterAll(async () => {
  await wmStoreMod.closeWorkingMemoryStore();
  removeTempDbPath(dbPath);
});

const ctxMain = { agentId: "main" };
const ctxPeer = { agentId: "example" };

async function call(name, ctx, params = {}) {
  const tool = host.resolve(name, ctx);
  expect(tool, `tool ${name} should resolve`).toBeTruthy();
  return tool.execute(params);
}

describe("factory registration & lane binding", () => {
  it("sub-session / incognito ctx falls into parent agent lane", () => {
    // 子会话与 incognito 会话共享父 agentId → 落父车道（工具层不按 sessionKey 拆分）
    expect(wmToolsMod.resolveLane({ agentId: "main", sessionKey: "agent:main:subagent:abc" }, PLUGIN_CONFIG)).toBe("agent:main");
    expect(wmToolsMod.resolveLane({ agentId: "main", sessionKey: "incognito:xyz" }, PLUGIN_CONFIG)).toBe("agent:main");
  });

  it("registers all 6 memory_wm_* tools", () => {
    expect([...host.registrations.keys()].sort()).toEqual([
      "memory_wm_append", "memory_wm_archive", "memory_wm_create",
      "memory_wm_get", "memory_wm_list", "memory_wm_update",
    ]);
  });

  it("factory returns null when workingMemory.enabled=false", () => {
    const disabledHost = makeHost();
    wmToolsMod.registerWmTools(disabledHost.registerTool, {
      getConfig: () => ({ workingMemory: { enabled: false } }),
      adapt: disabledHost.adapt,
    });
    expect(disabledHost.resolve("memory_wm_get", ctxMain)).toBeNull();
  });

  it("resolveLane binds agent:<id>, falls back to defaultScope", () => {
    expect(wmToolsMod.resolveLane(ctxMain, PLUGIN_CONFIG)).toBe("agent:main");
    expect(wmToolsMod.resolveLane({ agentId: "example" }, PLUGIN_CONFIG)).toBe("agent:example");
    expect(wmToolsMod.resolveLane({}, PLUGIN_CONFIG)).toBe("default");
    expect(wmToolsMod.resolveLane(undefined, PLUGIN_CONFIG)).toBe("default");
  });

  it("isAdminLane honors crossAgentWriteAllowlist", () => {
    expect(wmToolsMod.isAdminLane(ctxMain, PLUGIN_CONFIG)).toBe(true);
    expect(wmToolsMod.isAdminLane(ctxPeer, PLUGIN_CONFIG)).toBe(false);
    expect(wmToolsMod.isAdminLane({}, PLUGIN_CONFIG)).toBe(false);
  });
});

describe("create + get (own lane)", () => {
  it("creates task in caller lane", async () => {
    const res = await call("memory_wm_create", ctxMain, {
      taskId: "wm-2026-08-06-main-task",
      goal: "主车道任务",
      plan: [{ step: 1, action: "做", status: "pending", notes: "" }],
    });
    expect(res.details.success).toBe(true);
    expect(res.details.record.scope).toBe("agent:main");
    expect(res.details.record.owner).toBe("agent:main");
  });

  it("get without taskId resolves latest active in own lane", async () => {
    const res = await call("memory_wm_get", ctxMain);
    expect(res.details.record.task_id).toBe("wm-2026-08-06-main-task");
  });

  it("yaml format output contains task_id", async () => {
    const res = await call("memory_wm_get", ctxMain, { format: "yaml" });
    expect(res.content[0].text).toContain("task_id: wm-2026-08-06-main-task");
    expect(res.content[0].text).toContain("goal:");
  });

  it("empty lane returns empty-state hint", async () => {
    const res = await call("memory_wm_get", { agentId: "empty-agent" });
    expect(res.details.empty).toBe(true);
    expect(res.details.message).toMatch(/no active task/);
  });
});

describe("lane isolation (writes)", () => {
  it("non-admin cannot create in another lane", async () => {
    const res = await call("memory_wm_create", ctxPeer, {
      taskId: "wm-2026-08-06-intrusion",
      goal: "越权写入",
      scope: "agent:main",
    });
    expect(res.details.success).toBe(false);
    expect(res.details.error).toMatch(/lane isolation/);
  });

  it("non-admin cannot update/append/archive another lane", async () => {
    const u = await call("memory_wm_update", ctxPeer, { scope: "agent:main", taskId: "wm-2026-08-06-main-task", goal: "篡改" });
    expect(u.details.success).toBe(false);
    const a = await call("memory_wm_append", ctxPeer, { scope: "agent:main", taskId: "wm-2026-08-06-main-task", decisions: ["x"] });
    expect(a.details.success).toBe(false);
    const ar = await call("memory_wm_archive", ctxPeer, { scope: "agent:main", taskId: "wm-2026-08-06-main-task", outcome: "success" });
    expect(ar.details.success).toBe(false);
  });

  it("admin (main) can write another lane with explicit scope", async () => {
    const res = await call("memory_wm_create", ctxMain, {
      taskId: "wm-2026-08-06-peer-delegated",
      goal: "主 Agent 代 peer 创建",
      scope: "agent:example",
    });
    expect(res.details.success).toBe(true);
    expect(res.details.record.scope).toBe("agent:example");
  });

  it("peer sees the delegated task in own lane", async () => {
    const res = await call("memory_wm_get", ctxPeer);
    expect(res.details.record.task_id).toBe("wm-2026-08-06-peer-delegated");
  });
});

describe("cross-lane read", () => {
  it("peer can read main lane via explicit scope", async () => {
    const res = await call("memory_wm_get", ctxPeer, { scope: "agent:main", taskId: "wm-2026-08-06-main-task" });
    expect(res.details.record.goal).toBe("主车道任务");
  });

  it("list with scope shows other lane tasks", async () => {
    const res = await call("memory_wm_list", ctxPeer, { scope: "agent:main" });
    expect(res.details.tasks.map((t) => t.task_id)).toContain("wm-2026-08-06-main-task");
  });

  it("scopes=true returns cross-lane overview with yourLane marker", async () => {
    const res = await call("memory_wm_list", ctxMain, { scopes: true });
    expect(res.details.yourLane).toBe("agent:main");
    const lanes = res.details.lanes.map((l) => l.scope);
    expect(lanes).toContain("agent:main");
    expect(lanes).toContain("agent:example");
  });
});

describe("update / append / archive flow", () => {
  it("append accumulates decisions/learnings", async () => {
    const res = await call("memory_wm_append", ctxMain, {
      decisions: ["决策1"],
      learnings: ["经验1"],
      artifacts: ["out.md"],
    });
    expect(res.details.success).toBe(true);
    expect(res.details.appended.decisions).toBe(1);
  });

  it("update patches status and auto-writes completed_at", async () => {
    const res = await call("memory_wm_update", ctxMain, { status: "completed", outcome: "success" });
    expect(res.details.success).toBe(true);
    expect(res.details.record.completed_at).toMatch(/\+08:00$/);
  });

  it("archive without taskId resolves the completed active task and validates", async () => {
    const res = await call("memory_wm_archive", ctxMain, { outcome: "success", notes: "收尾" });
    expect(res.details.success).toBe(true);
    expect(res.details.record.status).toBe("archived");
  });

  it("archive reports missing fields when incomplete", async () => {
    await call("memory_wm_create", ctxPeer, { taskId: "wm-2026-08-06-thin-task", goal: "缺字段" });
    const res = await call("memory_wm_archive", ctxPeer, { taskId: "wm-2026-08-06-thin-task", outcome: "success" });
    expect(res.details.success).toBe(false);
    expect(res.details.missing).toContain("decisions");
  });

  it("after archiving, get default resolves next active or empty", async () => {
    const res = await call("memory_wm_get", ctxMain);
    expect(res.details.empty).toBe(true);
  });
});

describe("guardrails", () => {
  it("create requires taskId and goal", async () => {
    const tool = host.resolve("memory_wm_create", ctxMain);
    expect(tool.parameters.required).toEqual(["taskId", "goal"]);
  });

  it("update rejects empty patch", async () => {
    await call("memory_wm_create", ctxMain, { taskId: "wm-2026-08-06-guard", goal: "x" });
    const res = await call("memory_wm_update", ctxMain, {});
    expect(res.details.success).toBe(false);
    expect(res.details.error).toMatch(/no patch fields/);
  });

  it("archived task rejects further writes", async () => {
    const res = await call("memory_wm_update", ctxMain, { taskId: "wm-2026-08-06-main-task", goal: "改写归档" });
    expect(res.details.success).toBe(false);
    expect(res.details.error).toMatch(/archived/);
  });
});
