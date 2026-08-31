/**
 * Promote/update tools + migration + TS source structure tests
 */
import { beforeAll, describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { memoryPromote } from "../../dist/tools/promote.js";
import { closeStoreTool, initializeStoreTool } from "../../dist/tools/store.js";

const DIST = path.resolve(__dirname, "../../dist");

describe("memory_promote tool", () => {
  let promoteSrc;

  beforeAll(() => {
    promoteSrc = fs.readFileSync(path.join(DIST, "tools/promote.js"), "utf8");
  });

  it("registers as memory_promote in register.js", () => {
    const regSrc = fs.readFileSync(path.join(DIST, "tools/register.js"), "utf8");
    expect(regSrc).toContain('"memory_promote"');
  });

  it("supports layer and state parameters", () => {
    expect(promoteSrc).toContain("layer");
    expect(promoteSrc).toContain("state");
  });

  it("never writes promoted content to MEMORY.md and emits a content-free audit", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-promote-"));
    const previousWorkspace = process.env.OPENCLAW_WORKSPACE;
    process.env.OPENCLAW_WORKSPACE = workspace;
    const memoryFile = path.join(workspace, "MEMORY.md");
    fs.writeFileSync(memoryFile, "<long_term_memory />\n", "utf8");

    const secretContent = "CONTENT_MUST_NEVER_ENTER_CORE_MEMORY";
    const record = {
      id: "memory-1",
      scope: "agent:test",
      content: secretContent,
      category: "decision",
      importance: 0.9,
      createdAt: "2026-08-30T00:00:00.000Z",
      metadata: { state: "pending", layer: "working", promotionPending: true },
    };
    const updates: unknown[] = [];
    const store = {
      get: async () => record,
      update: async (_id: string, update: unknown) => {
        updates.push(update);
        return record;
      },
      status: async () => ({ connected: true, totalRecords: 1 }),
      close: async () => undefined,
    };

    try {
      await initializeStoreTool({} as never, store as never);
      const result = await memoryPromote({ memoryId: record.id, scope: record.scope });
      expect(result.success).toBe(true);
      expect(result.stateChanged).toBe(true);
      expect(result.auditPath).toMatch(/^memory[\\/]audit[\\/]promotions[\\/]/);
      expect(fs.readFileSync(memoryFile, "utf8")).toBe("<long_term_memory />\n");
      const auditText = fs.readFileSync(path.join(workspace, result.auditPath!), "utf8");
      expect(auditText).toContain('"event":"memory.promoted"');
      expect(auditText).toContain('"memoryId":"memory-1"');
      expect(auditText).not.toContain(secretContent);
      expect(updates).toHaveLength(1);
      expect(promoteSrc).not.toContain("MEMORY_LANCEDB_PRO_MANAGED");
      expect(promoteSrc).not.toContain("Dreaming Promotions");
    } finally {
      await closeStoreTool();
      if (previousWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE;
      else process.env.OPENCLAW_WORKSPACE = previousWorkspace;
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("is idempotent and does not append duplicate audit events", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-promote-idempotent-"));
    const previousWorkspace = process.env.OPENCLAW_WORKSPACE;
    process.env.OPENCLAW_WORKSPACE = workspace;
    const record: Record<string, unknown> = {
      id: "memory-2",
      scope: "agent:test",
      content: "safe",
      metadata: { state: "pending", layer: "working" },
    };
    const store = {
      get: async () => record,
      update: async (_id: string, update: { metadata?: unknown }) => {
        record.metadata = update.metadata;
        return record;
      },
      status: async () => ({ connected: true, totalRecords: 1 }),
      close: async () => undefined,
    };

    try {
      await initializeStoreTool({} as never, store as never);
      const first = await memoryPromote({ memoryId: "memory-2", scope: "agent:test" });
      const second = await memoryPromote({ memoryId: "memory-2", scope: "agent:test" });
      expect(first.stateChanged).toBe(true);
      expect(second.stateChanged).toBe(false);
      const audit = fs.readFileSync(path.join(workspace, first.auditPath!), "utf8").trim().split(/\r?\n/);
      expect(audit).toHaveLength(1);
    } finally {
      await closeStoreTool();
      if (previousWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE;
      else process.env.OPENCLAW_WORKSPACE = previousWorkspace;
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("rolls metadata back when the audit ledger cannot be written", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-promote-rollback-"));
    const invalidWorkspace = path.join(root, "not-a-directory");
    fs.writeFileSync(invalidWorkspace, "file", "utf8");
    const previousWorkspace = process.env.OPENCLAW_WORKSPACE;
    process.env.OPENCLAW_WORKSPACE = invalidWorkspace;
    const originalMetadata = { state: "pending", layer: "working" };
    const updates: unknown[] = [];
    const record = { id: "memory-3", scope: "agent:test", content: "safe", metadata: originalMetadata };
    const store = {
      get: async () => record,
      update: async (_id: string, update: { metadata?: unknown }) => {
        updates.push(update.metadata);
        return record;
      },
      status: async () => ({ connected: true, totalRecords: 1 }),
      close: async () => undefined,
    };

    try {
      await initializeStoreTool({} as never, store as never);
      const result = await memoryPromote({ memoryId: "memory-3", scope: "agent:test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("metadata was rolled back");
      expect(updates).toHaveLength(2);
      expect(updates[1]).toEqual(originalMetadata);
    } finally {
      await closeStoreTool();
      if (previousWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE;
      else process.env.OPENCLAW_WORKSPACE = previousWorkspace;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("memory_update tool", () => {
  it("registers as memory_update in register.js", () => {
    const regSrc = fs.readFileSync(path.join(DIST, "tools/register.js"), "utf8");
    expect(regSrc).toContain('"memory_update"');
  });

  it("requires memoryId", () => {
    const updateSrc = fs.readFileSync(path.join(DIST, "tools/update.js"), "utf8");
    expect(updateSrc).toContain("memoryId");
  });
});

describe("migration system", () => {
  let migSrc;

  beforeAll(() => {
    migSrc = fs.readFileSync(path.join(DIST, "store/migrations.js"), "utf8");
  });

  it("exports schema version constants", () => {
    expect(migSrc).toContain("CURRENT_SCHEMA_VERSION");
    expect(migSrc).toContain("LATEST_SCHEMA_VERSION");
  });

  it("provides migration managers", () => {
    expect(migSrc).toContain("createMigrationManager");
    expect(migSrc).toContain("createLegacyMigrationManager");
  });
});

describe("TypeScript source files", () => {
  const PLUGIN_ROOT = path.resolve(__dirname, "../..");

  it("src/index.ts exists and is non-empty", () => {
    const content = fs.readFileSync(path.join(PLUGIN_ROOT, "src/index.ts"), "utf8");
    expect(content.length).toBeGreaterThan(100);
  });

  it("src/tools/types.ts exists and uses SDK types", () => {
    const content = fs.readFileSync(path.join(PLUGIN_ROOT, "src/tools/types.ts"), "utf8");
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("openclaw/plugin-sdk/plugin-entry");
    expect(content).toContain("AnyAgentTool");
  });

  it("src/state/index.ts exists and has KeyedStore", () => {
    const content = fs.readFileSync(path.join(PLUGIN_ROOT, "src/state/index.ts"), "utf8");
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("KeyedStore");
    expect(content).toContain("openKeyedStore");
  });
});
