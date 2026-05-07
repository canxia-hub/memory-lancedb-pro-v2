/**
 * Tool entry point + SDK import + state module validation tests
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DIST = path.resolve(__dirname, "../../dist");

describe("tool registration module", () => {
  let registerSrc;

  beforeAll(() => {
    registerSrc = fs.readFileSync(path.join(DIST, "tools/register.js"), "utf8");
  });

  it("registers all 9 memory tools", () => {
    const names = [
      "memory_store", "memory_list", "memory_recall",
      "memory_update", "memory_archive", "memory_promote",
      "memory_stats", "memory_debug", "memory_migrate_legacy",
    ];
    for (const name of names) {
      expect(registerSrc).toContain(`"${name}"`);
    }
  });

  it("registers wiki tools", () => {
    expect(registerSrc).toContain("registerAllWikiTools");
  });

  it("has lazy tool context initialization", () => {
    expect(registerSrc).toContain("ensureToolContextReady");
  });
});

describe("plugin entry point", () => {
  let indexSrc;

  beforeAll(() => {
    indexSrc = fs.readFileSync(path.join(DIST, "index.js"), "utf8");
  });

  it("uses SDK definePluginEntry", () => {
    expect(indexSrc).toContain('import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry"');
  });

  it("has Phase 3 openKeyedStore integration", () => {
    expect(indexSrc).toContain("initPluginState");
    expect(indexSrc).toContain("openKeyedStore");
  });

  it("registers memory capability", () => {
    expect(indexSrc).toContain("registerMemoryCapability");
  });

  it("registers wiki supplements", () => {
    expect(indexSrc).toContain("registerMemoryPromptSupplement");
    expect(indexSrc).toContain("registerMemoryCorpusSupplement");
  });

  it("registers wiki CLI", () => {
    expect(indexSrc).toContain("registerWikiCli");
  });

  it("has singleton guard", () => {
    expect(indexSrc).toContain("_initialized = true");
  });

  it("exports legacy migration helpers", () => {
    const hasLegacy = indexSrc.includes("LegacyMigrator");
    const hasMigrate = indexSrc.includes("migrateFromLegacy");
    expect(hasLegacy || hasMigrate).toBe(true);
  });

  it("exports at least 8 symbols", () => {
    const exportCount = (indexSrc.match(/^export /gm) || []).length;
    expect(exportCount).toBeGreaterThanOrEqual(8);
  });
});

describe("Phase 3 state module", () => {
  let stateSrc;

  beforeAll(() => {
    stateSrc = fs.readFileSync(path.join(DIST, "state/plugin-state.js"), "utf8");
  });

  it("defines openKeyedStore wrapper", () => {
    expect(stateSrc).toContain("initPluginState");
    expect(stateSrc).toContain("openKeyedStore");
  });

  it("provides migration state helpers", () => {
    expect(stateSrc).toContain("getLastMigration");
    expect(stateSrc).toContain("setLastMigration");
  });

  it("provides stats helpers", () => {
    expect(stateSrc).toContain("getStats");
    expect(stateSrc).toContain("setStats");
  });

  it("provides search cache helpers", () => {
    expect(stateSrc).toContain("cacheSearch");
    expect(stateSrc).toContain("getSearchCache");
  });

  it("handles honest degradation", () => {
    expect(stateSrc).toContain("degradation");
  });
});
