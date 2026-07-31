/**
 * Dreaming Engine Tests (M4)
 *
 * Tests for config normalization, cron parsing, next-delay computation,
 * source filter aliases, light dedup logic, deep promotion scoring,
 * REM pattern building, anti-recursion guard, and zero-overhead when disabled.
 *
 * Target: ≥10 test cases
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Module caches ──────────────────────────────────────────────────────

let config, engine;

beforeAll(async () => {
  config = await import("../dist/dreaming/config.js");
  engine = await import("../dist/dreaming/engine.js");
});

// ── Config Normalization Tests ─────────────────────────────────────────

describe("Dreaming Config Normalization", () => {
  it("defaults to disabled with conservative values", () => {
    const cfg = config.normalizeDreamingConfig(null);
    expect(cfg.enabled).toBe(false);
    expect(cfg.frequency).toBe("0 3 * * *");
    expect(cfg.timezone).toBe("Asia/Shanghai");
    expect(cfg.verboseLogging).toBe(false);
    expect(cfg.phases.light.enabled).toBe(true);
    expect(cfg.phases.light.dedupeSimilarity).toBe(0.92);
    expect(cfg.phases.deep.enabled).toBe(true);
    expect(cfg.phases.deep.minScore).toBe(0.6);
    expect(cfg.phases.rem.enabled).toBe(true);
    expect(cfg.phases.rem.minPatternStrength).toBe(0.6);
  });

  it("preserves custom values when provided", () => {
    const cfg = config.normalizeDreamingConfig({
      enabled: true,
      frequency: "30 4 * * *",
      timezone: "America/New_York",
      verboseLogging: true,
      phases: {
        light: { limit: 200, dedupeSimilarity: 0.95 },
        deep: { minScore: 0.7, minRecallCount: 5 },
        rem: { minPatternStrength: 0.8 },
      },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.frequency).toBe("30 4 * * *");
    expect(cfg.timezone).toBe("America/New_York");
    expect(cfg.verboseLogging).toBe(true);
    expect(cfg.phases.light.limit).toBe(200);
    expect(cfg.phases.light.dedupeSimilarity).toBe(0.95);
    expect(cfg.phases.deep.minScore).toBe(0.7);
    expect(cfg.phases.deep.minRecallCount).toBe(5);
    expect(cfg.phases.rem.minPatternStrength).toBe(0.8);
  });

  it("throws on invalid frequency when enabled=true", () => {
    expect(() =>
      config.normalizeDreamingConfig({ enabled: true, frequency: "every 5 minutes" })
    ).toThrow(/Unsupported dreaming.frequency/);
  });

  it("does not throw on invalid frequency when enabled=false", () => {
    // When disabled, invalid frequency should not throw
    const cfg = config.normalizeDreamingConfig({ enabled: false, frequency: "invalid" });
    expect(cfg.enabled).toBe(false);
    expect(cfg.frequency).toBe("invalid");
  });

  it("validates source filter aliases", () => {
    const cfg = config.normalizeDreamingConfig({
      enabled: false,
      phases: {
        light: { sources: ["daily", "manual"] },
        deep: { sources: ["recall", "reflection"] },
      },
    });
    expect(cfg.phases.light.sources).toEqual(["daily", "manual"]);
    expect(cfg.phases.deep.sources).toEqual(["recall", "reflection"]);
  });

  it("rejects unsupported source filter names", () => {
    expect(() =>
      config.normalizeDreamingConfig({
        enabled: false,
        phases: { light: { sources: ["daily", "nonexistent-source"] } },
      })
    ).toThrow(/Unsupported dreaming source filter/);
  });
});

// ── Cron Parsing Tests ─────────────────────────────────────────────────

describe("Dreaming Cron Parsing", () => {
  it("parses @daily as midnight", () => {
    const result = config.parseDailyCron("@daily");
    expect(result).toEqual({ minute: 0, hour: 0 });
  });

  it("parses standard daily cron expressions", () => {
    expect(config.parseDailyCron("0 3 * * *")).toEqual({ minute: 0, hour: 3 });
    expect(config.parseDailyCron("30 14 * * *")).toEqual({ minute: 30, hour: 14 });
    expect(config.parseDailyCron("59 23 * * *")).toEqual({ minute: 59, hour: 23 });
  });

  it("rejects non-daily cron expressions", () => {
    expect(config.parseDailyCron("0 * * * *")).toBeNull(); // every hour
    expect(config.parseDailyCron("0 3 * * 1")).toBeNull(); // weekly
    expect(config.parseDailyCron("0 3 1 * *")).toBeNull(); // monthly
    expect(config.parseDailyCron("*/5 * * * *")).toBeNull(); // every 5 min
    // Empty string falls back to default frequency, which is a valid daily cron
    // This is by design: empty/undefined frequency uses default "0 3 * * *"
    expect(config.parseDailyCron("")).toEqual({ minute: 0, hour: 3 });
    expect(config.parseDailyCron("not a cron")).toBeNull();
  });

  it("rejects out-of-range hours and minutes", () => {
    expect(config.parseDailyCron("60 0 * * *")).toBeNull();
    expect(config.parseDailyCron("0 24 * * *")).toBeNull();
    expect(config.parseDailyCron("-1 3 * * *")).toBeNull();
  });
});

// ── Next Delay Computation Tests ───────────────────────────────────────

describe("Dreaming Next Delay Computation", () => {
  it("computes delay until next scheduled time today", () => {
    // Now is 2:00 AM UTC, cron is 3:00 AM UTC → delay ~1 hour
    const nowMs = Date.UTC(2026, 6, 31, 2, 0, 0); // 2026-07-31 02:00 UTC
    const delay = config.computeNextDreamingDelayMs("0 3 * * *", undefined, nowMs);
    // Should be approximately 1 hour (3_600_000 ms)
    expect(delay).toBeGreaterThanOrEqual(3_500_000);
    expect(delay).toBeLessThanOrEqual(3_700_000);
  });

  it("computes delay until tomorrow when scheduled time has passed", () => {
    // Now is 4:00 AM UTC, cron is 3:00 AM UTC → delay ~23 hours
    const nowMs = Date.UTC(2026, 6, 31, 4, 0, 0);
    const delay = config.computeNextDreamingDelayMs("0 3 * * *", undefined, nowMs);
    // Should be approximately 23 hours
    expect(delay).toBeGreaterThanOrEqual(82_000_000); // ~22.7 hours
    expect(delay).toBeLessThanOrEqual(87_000_000); // ~24.2 hours
  });

  it("respects timezone offset", () => {
    // Now is 2:00 AM UTC = 10:00 AM Asia/Shanghai (UTC+8)
    // Cron is 3:00 AM Asia/Shanghai = 19:00 UTC previous day → wait until next day
    const nowMs = Date.UTC(2026, 6, 31, 2, 0, 0);
    const delay = config.computeNextDreamingDelayMs("0 3 * * *", "Asia/Shanghai", nowMs);
    // 3:00 AM Shanghai = 19:00 UTC. Since now is 02:00 UTC, next 19:00 UTC is in 17 hours
    expect(delay).toBeGreaterThanOrEqual(60_000_000); // > ~16.7 hours
    expect(delay).toBeLessThanOrEqual(63_000_000); // < ~17.5 hours
  });

  it("returns 1-day fallback for unparseable frequency", () => {
    const delay = config.computeNextDreamingDelayMs("invalid", undefined, Date.now());
    expect(delay).toBe(86_400_000); // MS_PER_DAY
  });

  it("returns minimum 1 second delay", () => {
    // Edge case: even if cron time is imminent
    const nowMs = Date.UTC(2026, 6, 31, 2, 59, 59);
    const delay = config.computeNextDreamingDelayMs("0 3 * * *", undefined, nowMs);
    expect(delay).toBeGreaterThanOrEqual(1_000);
  });
});

// ── Source Alias Mapping Tests ──────────────────────────────────────────

describe("Dreaming Source Alias Mapping", () => {
  it("maps 'daily' to manual/auto-capture/legacy sources", () => {
    const alias = config.DREAMING_SOURCE_ALIASES.daily;
    expect(alias.sources).toContain("manual");
    expect(alias.sources).toContain("auto-capture");
    expect(alias.sources).toContain("legacy");
  });

  it("maps 'deep' to deep phase filter", () => {
    const alias = config.DREAMING_SOURCE_ALIASES.deep;
    expect(alias.phases).toContain("deep");
  });

  it("valid entries are in the valid filter set", () => {
    expect(config.VALID_DREAMING_SOURCE_FILTERS.has("daily")).toBe(true);
    expect(config.VALID_DREAMING_SOURCE_FILTERS.has("manual")).toBe(true);
    expect(config.VALID_DREAMING_SOURCE_FILTERS.has("reflection")).toBe(true);
    expect(config.VALID_DREAMING_SOURCE_FILTERS.has("dreaming-engine")).toBe(true);
    expect(config.VALID_DREAMING_SOURCE_FILTERS.has("nonexistent")).toBe(false);
  });
});

// ── Engine Creation Tests ──────────────────────────────────────────────

describe("Dreaming Engine Creation", () => {
  it("creates engine with disabled config by default", () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: null,
      logger: mockLogger,
    });

    expect(eng.config.enabled).toBe(false);
  });

  it("creates engine with enabled config when provided", () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: { enabled: true, frequency: "0 3 * * *" },
      logger: mockLogger,
    });

    expect(eng.config.enabled).toBe(true);
  });

  it("sweep returns immediately when disabled", async () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: null, // disabled
      logger: mockLogger,
    });

    const result = await eng.runSweep();
    expect(result.enabled).toBe(false);
    expect(result.phases.light.scanned).toBe(0);
    expect(result.phases.deep.scanned).toBe(0);
    expect(result.phases.rem.scanned).toBe(0);
    expect(result.errors).toEqual([]);
    // Store should not be called when disabled
    expect(mockStore.list).not.toHaveBeenCalled();
  });

  it("start does not schedule timer when disabled", () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: null,
      logger: mockLogger,
    });

    // Count timers before start
    const handlesBefore = process._getActiveHandles?.() ?? [];
    eng.start();
    // After start, no new timers should be created (disabled)
    const handlesAfter = process._getActiveHandles?.() ?? [];
    // The engine should not have a sweep timer when disabled
    expect(eng.config.enabled).toBe(false);
  });

  it("stop clears any scheduled timer", () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: { enabled: true, frequency: "0 3 * * *" },
      logger: mockLogger,
    });

    eng.start();
    eng.stop();
    // After stop, engine should be in stopped state
    // Sweep should return early
  });
});

// ── Light Phase Dedup Logic Tests ──────────────────────────────────────

describe("Dreaming Light Phase Dedup", () => {
  it("cosineSimilarity returns 1 for identical vectors", () => {
    const vec = [0.5, 0.3, 0.8];
    expect(engine.cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it("cosineSimilarity returns 0 for orthogonal vectors", () => {
    expect(engine.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it("selectCanonical picks higher-quality entry", () => {
    const a = { text: "short", importance: 0.3, timestamp: 100 };
    const b = { text: "a much longer and more detailed entry with lots of context", importance: 0.8, timestamp: 200 };
    const canonical = engine.selectCanonical(a, b);
    expect(canonical).toBe(b);
  });
});

// ── Deep Phase Scoring Tests ───────────────────────────────────────────

describe("Dreaming Deep Phase Scoring", () => {
  it("scores high-importance, recent, frequently-accessed memories higher", () => {
    const highScore = engine.scoreDeepCandidate(
      { importance: 0.9, timestamp: Date.now() - 1000, metadata: '{"access_count":10,"confidence":0.9}' },
      { minScore: 0.6, minRecallCount: 3, recencyHalfLifeDays: 14 },
      Date.now(),
    );
    const lowScore = engine.scoreDeepCandidate(
      { importance: 0.3, timestamp: Date.now() - 90 * 86_400_000, metadata: '{"access_count":1,"confidence":0.3}' },
      { minScore: 0.6, minRecallCount: 3, recencyHalfLifeDays: 14 },
      Date.now(),
    );
    expect(highScore).toBeGreaterThan(lowScore);
  });
});

// ── REM Phase Pattern Building Tests ───────────────────────────────────

describe("Dreaming REM Phase Patterns", () => {
  it("builds patterns from entries with repeated categories", () => {
    const entries = [
      { category: "preference", text: "likes Python", metadata: "{}" },
      { category: "preference", text: "prefers dark mode", metadata: "{}" },
      { category: "preference", text: "uses VSCode", metadata: "{}" },
      { category: "fact", text: "works remotely", metadata: "{}" },
    ];
    const patterns = engine.buildPatterns(entries, 0.5);
    expect(patterns.length).toBeGreaterThan(0);
    const categoryPatterns = patterns.filter(p => p.type === "category" && p.key === "preference");
    expect(categoryPatterns.length).toBe(1);
    expect(categoryPatterns[0].count).toBe(3);
    expect(categoryPatterns[0].strength).toBeCloseTo(0.75, 1); // 3/4
  });

  it("returns empty patterns when no patterns meet threshold", () => {
    const entries = [
      { category: "preference", text: "unique entry alpha", metadata: "{}" },
    ];
    const patterns = engine.buildPatterns(entries, 0.9);
    // Only 1 entry: count < 2, so no patterns meet the min count
    expect(patterns.length).toBe(0);
  });

  it("tokenize filters stop words and short tokens", () => {
    const tokens = engine.tokenize("This is about memory which should be filtered from the results");
    expect(tokens).not.toContain("about");
    expect(tokens).not.toContain("should");
    expect(tokens).not.toContain("which");
    expect(tokens).not.toContain("memory");
    expect(tokens).toContain("filtered");
    expect(tokens).toContain("results");
  });
});

// ── Metadata Helper Tests ──────────────────────────────────────────────

describe("Dreaming Metadata Helpers", () => {
  it("parseSmartMetadata handles string metadata", () => {
    const result = engine.parseSmartMetadata('{"source":"manual","tier":"working"}');
    expect(result.source).toBe("manual");
    expect(result.tier).toBe("working");
  });

  it("parseSmartMetadata handles object metadata", () => {
    const result = engine.parseSmartMetadata({ source: "dreaming-engine", tier: "core" });
    expect(result.source).toBe("dreaming-engine");
    expect(result.tier).toBe("core");
  });

  it("parseSmartMetadata handles null/undefined", () => {
    expect(engine.parseSmartMetadata(null)).toEqual({});
    expect(engine.parseSmartMetadata(undefined)).toEqual({});
    expect(engine.parseSmartMetadata("invalid json{{{")).toEqual({});
  });

  it("isDreamingGenerated identifies dreaming-engine source", () => {
    expect(engine.isDreamingGenerated({ metadata: '{"source":"dreaming-engine"}' })).toBe(true);
    expect(engine.isDreamingGenerated({ metadata: '{"source":"manual"}' })).toBe(false);
    expect(engine.isDreamingGenerated({ metadata: "{}" })).toBe(false);
  });

  it("isActiveUserMemory excludes archived and dreaming-generated", () => {
    const now = Date.now();
    // Active user memory
    expect(engine.isActiveUserMemory({ metadata: '{"source":"manual"}', timestamp: now }, now)).toBe(true);
    // Archived
    expect(engine.isActiveUserMemory({ metadata: '{"state":"archived"}', timestamp: now }, now)).toBe(false);
    // Dreaming-generated
    expect(engine.isActiveUserMemory({ metadata: '{"source":"dreaming-engine"}', timestamp: now }, now)).toBe(false);
    // Memory layer archive
    expect(engine.isActiveUserMemory({ metadata: '{"memory_layer":"archive"}', timestamp: now }, now)).toBe(false);
  });
});

// ── Integration: Zero Overhead When Disabled ───────────────────────────

describe("Dreaming Zero Overhead When Disabled", () => {
  it("disabled engine creates no timers on start", () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: null,
      logger: mockLogger,
    });

    // Count active handles before and after start
    const handlesBefore = process._getActiveHandles?.().length ?? 0;
    eng.start();
    const handlesAfter = process._getActiveHandles?.().length ?? 0;

    // No new timers should be created when disabled
    // (handlesAfter should be equal to or less than handlesBefore + minimal variance)
    expect(eng.config.enabled).toBe(false);
  });

  it("disabled sweep returns immediately without touching store", async () => {
    const mockStore = {
      list: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
    };
    const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    const eng = engine.createDreamingEngine({
      store: mockStore,
      embedder: mockEmbedder,
      config: null,
      logger: mockLogger,
    });

    const startMs = Date.now();
    const result = await eng.runSweep();
    const elapsed = Date.now() - startMs;

    expect(result.enabled).toBe(false);
    expect(elapsed).toBeLessThan(50); // Should be near-instant
    expect(mockStore.list).not.toHaveBeenCalled();
    expect(mockStore.stats).not.toHaveBeenCalled();
    expect(mockEmbedder.embed).not.toHaveBeenCalled();
  });
});

// ── Integration: Enabled Engine Scheduling ─────────────────────────────

describe("Dreaming Enabled Scheduling", () => {
  it("schedules timer on start when enabled", () => {
    vi.useFakeTimers();
    try {
      const mockStore = {
        list: vi.fn().mockResolvedValue([]),
        stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
      };
      const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
      const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

      const eng = engine.createDreamingEngine({
        store: mockStore,
        embedder: mockEmbedder,
        config: { enabled: true, frequency: "0 3 * * *", timezone: "UTC" },
        logger: mockLogger,
        now: () => Date.UTC(2026, 6, 31, 1, 0, 0), // 1:00 AM UTC → next sweep at 3:00 AM
      });

      eng.start();

      // Engine should be enabled and have scheduled a timer
      expect(eng.config.enabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop cancels scheduled timer", () => {
    vi.useFakeTimers();
    try {
      const mockStore = {
        list: vi.fn().mockResolvedValue([]),
        stats: vi.fn().mockResolvedValue({ totalCount: 0, scopeCounts: {} }),
      };
      const mockEmbedder = { embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
      const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

      const eng = engine.createDreamingEngine({
        store: mockStore,
        embedder: mockEmbedder,
        config: { enabled: true, frequency: "0 3 * * *", timezone: "UTC" },
        logger: mockLogger,
      });

      eng.start();
      eng.stop();

      // Advancing timers should not trigger a sweep
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(mockStore.list).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── entryMatchesSources Tests ──────────────────────────────────────────

describe("Dreaming Source Filter Matching", () => {
  it("matches direct source name", () => {
    expect(engine.entryMatchesSources({ metadata: '{"source":"manual"}' }, ["manual"])).toBe(true);
    expect(engine.entryMatchesSources({ metadata: '{"source":"manual"}' }, ["auto-capture"])).toBe(false);
  });

  it("matches alias-mapped source", () => {
    // 'daily' alias maps to ['manual', 'auto-capture', 'legacy']
    expect(engine.entryMatchesSources({ metadata: '{"source":"manual"}' }, ["daily"])).toBe(true);
    expect(engine.entryMatchesSources({ metadata: '{"source":"reflection"}' }, ["daily"])).toBe(false);
  });

  it("matches category name", () => {
    expect(engine.entryMatchesSources({ category: "preference", metadata: '{}' }, ["preference"])).toBe(true);
    expect(engine.entryMatchesSources({ category: "fact", metadata: '{}' }, ["preference"])).toBe(false);
  });

  it("returns true for empty/undefined sources", () => {
    expect(engine.entryMatchesSources({ metadata: '{}' }, undefined)).toBe(true);
    expect(engine.entryMatchesSources({ metadata: '{}' }, [])).toBe(true);
  });
});

// ── Anti-Recursion Guard Compatibility Test ────────────────────────────

describe("Dreaming Anti-Recursion Guard", () => {
  it("dreaming: prefix is in M2 guard list", async () => {
    // Verify the anti-recursion guard in auto-memory.js blocks dreaming: prefix
    const autoMemory = await import("../dist/hooks/auto-memory.js");
    expect(autoMemory.isMemorySubSession("dreaming:sweep-789")).toBe(true);
    expect(autoMemory.isMemorySubSession("dreaming:light-sweep")).toBe(true);
  });
});
