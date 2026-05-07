/**
 * Promote/update tools + migration + TS source structure tests
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

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
