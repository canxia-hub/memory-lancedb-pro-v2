/**
 * Working Memory Store runtime tests — real temp LanceDB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTempDbPath, removeTempDbPath } from "./setup.js";

let store;
let mod;
let dbPath;

const LANE_MAIN = "agent:main";
const LANE_TUAN = "agent:tuan";

function makeTask(overrides = {}) {
  return {
    task_id: "wm-2026-08-06-test-task",
    scope: LANE_MAIN,
    goal: "测试任务目标",
    status: "in_progress",
    priority: "high",
    owner: "agent:main",
    source: "user-request",
    plan: [{ step: 1, action: "定义", status: "pending", notes: "" }],
    decisions: ["决策A"],
    learnings: ["经验A"],
    ...overrides,
  };
}

beforeAll(async () => {
  dbPath = createTempDbPath();
  mod = await import("../dist/store/working-memory-store.js");
  store = mod.createWorkingMemoryStore({ dbPath, tableName: "working_memory_test" });
  await store.initialize();
});

afterAll(async () => {
  await store.close();
  removeTempDbPath(dbPath);
});

describe("initialization", () => {
  it("creates table idempotently", async () => {
    const store2 = mod.createWorkingMemoryStore({ dbPath, tableName: "working_memory_test" });
    await store2.initialize();
    const st = await store2.status();
    expect(st.initialized).toBe(true);
    await store2.close();
  });

  it("reports status", async () => {
    const st = await store.status();
    expect(st.tableName).toBe("working_memory_test");
    expect(typeof st.totalTasks).toBe("number");
  });
});

describe("create", () => {
  it("creates a task with array fields round-trip", async () => {
    const res = await store.create(makeTask());
    expect(res.success).toBe(true);
    expect(res.record.plan).toHaveLength(1);
    expect(res.record.decisions).toEqual(["决策A"]);
    expect(res.record.created_at).toMatch(/\+08:00$/);
  });

  it("rejects missing task_id", async () => {
    const res = await store.create(makeTask({ task_id: "" }));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/task_id is required/);
  });

  it("rejects missing scope", async () => {
    const res = await store.create(makeTask({ task_id: "wm-2026-08-06-x", scope: "" }));
    expect(res.success).toBe(false);
  });

  it("rejects invalid status", async () => {
    const res = await store.create(makeTask({ task_id: "wm-2026-08-06-bad", status: "weird" }));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid status/);
  });

  it("rejects duplicate task_id in same lane", async () => {
    const res = await store.create(makeTask());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already exists/);
  });

  it("allows same task_id in a different lane", async () => {
    const res = await store.create(makeTask({ scope: LANE_TUAN }));
    expect(res.success).toBe(true);
    expect(res.record.scope).toBe(LANE_TUAN);
  });
});

describe("get / getActive", () => {
  it("getByTaskId round-trips full record", async () => {
    const rec = await store.getByTaskId(LANE_MAIN, "wm-2026-08-06-test-task");
    expect(rec.goal).toBe("测试任务目标");
    expect(rec.plan[0].action).toBe("定义");
    expect(rec.status).toBe("in_progress");
  });

  it("getByTaskId returns null for missing", async () => {
    expect(await store.getByTaskId(LANE_MAIN, "wm-2026-08-06-nope")).toBeNull();
  });

  it("getActive returns the active task for the lane", async () => {
    const rec = await store.getActive(LANE_MAIN);
    expect(rec.task_id).toBe("wm-2026-08-06-test-task");
  });

  it("getActive returns null for lane with only archived tasks", async () => {
    const rec = await store.getActive("agent:nobody");
    expect(rec).toBeNull();
  });
});

describe("update", () => {
  it("patches scalar fields and refreshes updated_at", async () => {
    const res = await store.update(LANE_MAIN, "wm-2026-08-06-test-task", { goal: "新目标", current_step: 2 });
    expect(res.success).toBe(true);
    expect(res.record.goal).toBe("新目标");
    expect(res.record.current_step).toBe(2);
  });

  it("auto-writes completed_at when status becomes completed", async () => {
    await store.create(makeTask({ task_id: "wm-2026-08-06-complete-me" }));
    const res = await store.update(LANE_MAIN, "wm-2026-08-06-complete-me", { status: "completed", outcome: "success" });
    expect(res.success).toBe(true);
    expect(res.record.completed_at).toMatch(/\+08:00$/);
  });

  it("rejects invalid status in patch", async () => {
    const res = await store.update(LANE_MAIN, "wm-2026-08-06-test-task", { status: "weird" });
    expect(res.success).toBe(false);
  });

  it("rejects non-array patch for array field", async () => {
    const res = await store.update(LANE_MAIN, "wm-2026-08-06-test-task", { decisions: "not-an-array" });
    expect(res.success).toBe(false);
  });

  it("returns error for missing task", async () => {
    const res = await store.update(LANE_MAIN, "wm-2026-08-06-ghost", { goal: "x" });
    expect(res.success).toBe(false);
  });
});

describe("append", () => {
  it("appends to multiple array fields with lengths", async () => {
    const res = await store.append(LANE_MAIN, "wm-2026-08-06-test-task", {
      decisions: ["决策B"],
      learnings: ["经验B", "经验C"],
    });
    expect(res.success).toBe(true);
    expect(res.appended.decisions).toBe(2);
    expect(res.appended.learnings).toBe(3);
  });

  it("rejects append with no array fields", async () => {
    const res = await store.append(LANE_MAIN, "wm-2026-08-06-test-task", {});
    expect(res.success).toBe(false);
  });

  it("can update notes alongside append", async () => {
    const res = await store.append(LANE_MAIN, "wm-2026-08-06-test-task", { risks: ["风险A"], notes: "备注更新" });
    expect(res.success).toBe(true);
    expect(res.record.notes).toBe("备注更新");
  });
});

describe("archive", () => {
  it("fails validation with missing required fields listed", async () => {
    await store.create(makeTask({ task_id: "wm-2026-08-06-thin", decisions: [], learnings: [], artifacts: [] }));
    const res = await store.archive(LANE_MAIN, "wm-2026-08-06-thin", { outcome: "success", status: "completed" });
    expect(res.success).toBe(false);
    expect(res.missing).toContain("decisions");
    expect(res.missing).toContain("learnings");
    expect(res.missing).toContain("artifacts");
  });

  it("archives a complete task", async () => {
    await store.create(makeTask({ task_id: "wm-2026-08-06-arch", artifacts: ["a.md"] }));
    const res = await store.archive(LANE_MAIN, "wm-2026-08-06-arch", { outcome: "success", status: "completed" });
    expect(res.success).toBe(true);
    expect(res.record.status).toBe("archived");
    expect(res.record.archived_at).toMatch(/\+08:00$/);
    expect(res.record.completed_at).toMatch(/\+08:00$/);
  });

  it("rejects double archive", async () => {
    const res = await store.archive(LANE_MAIN, "wm-2026-08-06-arch", {});
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already archived/);
  });

  it("rejects update/append on archived task (read-only)", async () => {
    const u = await store.update(LANE_MAIN, "wm-2026-08-06-arch", { goal: "x" });
    expect(u.success).toBe(false);
    expect(u.error).toMatch(/archived/);
    const a = await store.append(LANE_MAIN, "wm-2026-08-06-arch", { decisions: ["x"] });
    expect(a.success).toBe(false);
  });

  it("archived task no longer resolves as active", async () => {
    const rec = await store.getActive(LANE_MAIN);
    expect(rec.task_id).not.toBe("wm-2026-08-06-arch");
  });
});

describe("list / laneOverview", () => {
  it("lists only non-archived by default, filtered by scope", async () => {
    const res = await store.list({ scope: LANE_MAIN });
    expect(res.success).toBe(true);
    const ids = res.tasks.map((t) => t.task_id);
    expect(ids).toContain("wm-2026-08-06-test-task");
    expect(ids).not.toContain("wm-2026-08-06-arch");
  });

  it("lists archived when status=archived", async () => {
    const res = await store.list({ scope: LANE_MAIN, status: "archived" });
    expect(res.tasks.map((t) => t.task_id)).toContain("wm-2026-08-06-arch");
  });

  it("cross-lane view: main can list tuan lane", async () => {
    const res = await store.list({ scope: LANE_TUAN });
    expect(res.tasks.map((t) => t.task_id)).toContain("wm-2026-08-06-test-task");
  });

  it("laneOverview aggregates lanes", async () => {
    const res = await store.laneOverview();
    expect(res.success).toBe(true);
    const main = res.lanes.find((l) => l.scope === LANE_MAIN);
    const tuan = res.lanes.find((l) => l.scope === LANE_TUAN);
    expect(main.archived).toBe(1);
    expect(main.latestActive).toBeTruthy();
    expect(tuan.active).toBe(1);
  });

  it("pagination works", async () => {
    const res = await store.list({ scope: LANE_MAIN, limit: 1, offset: 0 });
    expect(res.tasks).toHaveLength(1);
    expect(res.hasMore).toBe(true);
  });
});

describe("importRecord (migration)", () => {
  it("imports preserving original timestamps", async () => {
    const res = await store.importRecord({
      task_id: "wm-2026-03-23-legacy",
      scope: LANE_MAIN,
      goal: "历史任务",
      status: "archived",
      created_at: "2026-03-23T10:00:00+08:00",
      updated_at: "2026-03-23T12:00:00+08:00",
      archived_at: "2026-03-23T12:00:00+08:00",
      decisions: ["旧决策"],
    });
    expect(res.imported).toBe(true);
    const rec = await store.getByTaskId(LANE_MAIN, "wm-2026-03-23-legacy");
    expect(rec.created_at).toBe("2026-03-23T10:00:00+08:00");
    expect(rec.archived_at).toBe("2026-03-23T12:00:00+08:00");
    expect(rec.decisions).toEqual(["旧决策"]);
  });

  it("skipExisting skips duplicates", async () => {
    const res = await store.importRecord({ task_id: "wm-2026-03-23-legacy", scope: LANE_MAIN });
    expect(res.imported).toBe(false);
    expect(res.skipped).toBe(true);
  });

  it("coerces invalid status to archived for legacy data", async () => {
    const res = await store.importRecord({ task_id: "wm-2026-04-01-weird", scope: LANE_MAIN, status: "weird-status" });
    expect(res.imported).toBe(true);
    expect(res.record.status).toBe("archived");
  });
});

describe("helpers", () => {
  it("nowIsoCn produces +08:00 ISO format", () => {
    expect(mod.nowIsoCn()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  });

  it("isValidTaskId accepts canonical and rejects junk", () => {
    expect(mod.isValidTaskId("wm-2026-08-06-working-memory")).toBe(true);
    expect(mod.isValidTaskId("WM-2026-08-06-Upper")).toBe(false);
    expect(mod.isValidTaskId("random")).toBe(false);
  });
});
