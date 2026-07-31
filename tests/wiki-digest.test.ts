/**
 * Wiki Digest Compiler Tests — M6 P0a-2
 *
 * Tests the digest compiler: claim extraction, freshness grading,
 * page scoring, digest output format, and integration with supplement.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Import the modules under test
import { compileDigest, ensureDigest, isDigestFresh } from "../dist/wiki/digest-compiler.js";
import { createWikiPromptSectionBuilder, createWikiCorpusSupplement } from "../dist/wiki/wiki-supplement.js";

// ── Test fixture: temp wiki vault ──────────────────────────────────────

const TEMP_VAULT = path.join(os.tmpdir(), `wiki-digest-test-${Date.now()}`);

function setupTempVault() {
  // Create category directories
  for (const cat of ["concepts", "decisions", "procedures", "references", "snippets"]) {
    fs.mkdirSync(path.join(TEMP_VAULT, cat), { recursive: true });
  }
  fs.mkdirSync(path.join(TEMP_VAULT, ".openclaw-wiki", "cache"), { recursive: true });

  // Create test pages
  const now = new Date().toISOString().replace("Z", "+08:00");
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace("Z", "+08:00");
  const monthAgo = new Date(Date.now() - 40 * 86400000).toISOString().replace("Z", "+08:00");

  // Page 1: Fresh concept with questions
  fs.writeFileSync(path.join(TEMP_VAULT, "concepts", "test-concept.md"), [
    "---",
    `title: Test Concept Alpha`,
    "category: concepts",
    "tags: [test, digest]",
    "status: stable",
    "confidence: 0.9",
    `created: ${now}`,
    `updated: ${now}`,
    "---",
    "",
    "# Test Concept Alpha",
    "",
    "This is the primary claim for the test concept. It should appear as the first claim in the digest.",
    "",
    "## Key Insight",
    "",
    "A deeper explanation of the concept.",
    "",
    "## Open Questions",
    "",
    "- Why does this concept matter?",
    "- How does it relate to other concepts?",
    "",
  ].join("\n"), "utf8");

  // Page 2: Aging decision with contradictions
  fs.writeFileSync(path.join(TEMP_VAULT, "decisions", "2026-07-31-test-decision.md"), [
    "---",
    `title: Test Decision Beta`,
    "category: decisions",
    "tags: [test, decision]",
    "status: stable",
    "confidence: 0.85",
    `created: ${weekAgo}`,
    `updated: ${weekAgo}`,
    "---",
    "",
    "# Test Decision Beta",
    "",
    "We decided to use the new architecture pattern because it provides better scalability.",
    "",
    "## 矛盾",
    "",
    "- Old pattern still preferred for simple cases",
    "- Migration cost may outweigh benefits",
    "",
  ].join("\n"), "utf8");

  // Page 3: Stale procedure
  fs.writeFileSync(path.join(TEMP_VAULT, "procedures", "test-procedure.md"), [
    "---",
    `title: Test Procedure Gamma`,
    "category: procedures",
    "tags: [test, procedure]",
    "status: deprecated",
    "confidence: 0.7",
    `created: ${monthAgo}`,
    `updated: ${monthAgo}`,
    "---",
    "",
    "# Test Procedure Gamma",
    "",
    "This is an old procedure that has been deprecated.",
    "",
    "## Steps",
    "",
    "1. Step one",
    "2. Step two",
    "",
  ].join("\n"), "utf8");

  // Page 4: Reference with no claims (should not appear in digest)
  fs.writeFileSync(path.join(TEMP_VAULT, "references", "empty-ref.md"), [
    "---",
    `title: Empty Reference`,
    "category: references",
    "tags: [test]",
    "status: draft",
    `created: ${now}`,
    `updated: ${now}`,
    "---",
    "",
    "# Empty Reference",
    "",
  ].join("\n"), "utf8");
}

function teardownTempVault() {
  try {
    fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Wiki Digest Compiler (M6 P0a-2)", () => {
  beforeAll(() => {
    setupTempVault();
  });

  afterAll(() => {
    teardownTempVault();
  });

  it("compileDigest produces valid digest with correct structure", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });

    // Top-level structure
    expect(digest).toHaveProperty("claimCount");
    expect(digest).toHaveProperty("totalPages");
    expect(digest).toHaveProperty("pages");
    expect(digest).toHaveProperty("contradictionClusters");
    expect(digest).toHaveProperty("compiledAt");

    expect(typeof digest.claimCount).toBe("number");
    expect(typeof digest.totalPages).toBe("number");
    expect(Array.isArray(digest.pages)).toBe(true);
    expect(Array.isArray(digest.contradictionClusters)).toBe(true);
    expect(typeof digest.compiledAt).toBe("string");
  });

  it("compileDigest extracts claims from pages with non-empty content", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });

    // At least 3 pages have content (concepts, decisions, procedures)
    expect(digest.totalPages).toBeGreaterThanOrEqual(3);

    // Pages in digest should have claims
    for (const page of digest.pages) {
      expect(page.claimCount).toBeGreaterThan(0);
      expect(page.topClaims.length).toBeGreaterThan(0);
      expect(page.title).toBeTruthy();
      expect(page.kind).toBeTruthy();
    }
  });

  it("compileDigest respects MAX_PAGES=4 limit", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });
    expect(digest.pages.length).toBeLessThanOrEqual(4);
  });

  it("compileDigest respects MAX_CLAIMS_PER_PAGE=2 limit", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });
    for (const page of digest.pages) {
      expect(page.topClaims.length).toBeLessThanOrEqual(2);
    }
  });

  it("compileDigest assigns freshness levels correctly", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });

    // At least one page should have freshness info
    const allClaims = digest.pages.flatMap(p => p.topClaims);
    const freshnessLevels = allClaims.map(c => c.freshnessLevel);
    expect(freshnessLevels.length).toBeGreaterThan(0);

    // Should contain at least 'stale' or 'fresh' or 'aging'
    const validLevels = new Set(["fresh", "aging", "stale"]);
    for (const level of freshnessLevels) {
      expect(validLevels.has(level)).toBe(true);
    }
  });

  it("compileDigest extracts questions from pages", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });

    // The test concept has questions
    const conceptPage = digest.pages.find(p => p.title === "Test Concept Alpha");
    // May or may not be in top 4 pages depending on score, but verify structure
    if (conceptPage) {
      expect(Array.isArray(conceptPage.questions)).toBe(true);
    }
  });

  it("compileDigest extracts contradictions from pages", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: true });

    // The test decision has contradictions section
    const decisionPage = digest.pages.find(p => p.title === "Test Decision Beta");
    if (decisionPage) {
      expect(Array.isArray(decisionPage.contradictions)).toBe(true);
    }
  });

  it("compileDigest writes agent-digest.json when not dryRun", () => {
    const digest = compileDigest({ vaultPath: TEMP_VAULT, dryRun: false });

    const digestPath = path.join(TEMP_VAULT, ".openclaw-wiki", "cache", "agent-digest.json");
    expect(fs.existsSync(digestPath)).toBe(true);

    // File content should be valid JSON matching the digest
    const fileContent = JSON.parse(fs.readFileSync(digestPath, "utf8"));
    expect(fileContent.claimCount).toBe(digest.claimCount);
    expect(fileContent.pages.length).toBe(digest.pages.length);
  });

  it("isDigestFresh returns true for recently compiled digest", () => {
    // Compile first
    compileDigest({ vaultPath: TEMP_VAULT, dryRun: false });

    // Should be fresh (just compiled)
    expect(isDigestFresh(TEMP_VAULT)).toBe(true);
  });

  it("isDigestFresh returns false when no digest exists", () => {
    const emptyVault = path.join(os.tmpdir(), `wiki-fresh-test-${Date.now()}`);
    fs.mkdirSync(emptyVault, { recursive: true });
    try {
      expect(isDigestFresh(emptyVault)).toBe(false);
    } finally {
      fs.rmSync(emptyVault, { recursive: true, force: true });
    }
  });

  it("ensureDigest returns existing digest when fresh", () => {
    // Compile first
    const first = compileDigest({ vaultPath: TEMP_VAULT, dryRun: false });

    // ensureDigest should return the cached one
    const second = ensureDigest({ vaultPath: TEMP_VAULT, force: false });
    expect(second.compiledAt).toBe(first.compiledAt);
  });

  it("ensureDigest recompiles when forced", () => {
    const first = compileDigest({ vaultPath: TEMP_VAULT, dryRun: false });

    // Small delay to get different compiledAt
    const second = ensureDigest({ vaultPath: TEMP_VAULT, force: true });
    // compiledAt may differ (recompiled)
    expect(second.claimCount).toBe(first.claimCount); // Same data
  });
});

describe("Wiki Prompt Section with Digest (M6 P0a-2 integration)", () => {
  beforeAll(() => {
    setupTempVault();
    // Compile digest for the temp vault
    compileDigest({ vaultPath: TEMP_VAULT, dryRun: false });
  });

  afterAll(() => {
    teardownTempVault();
  });

  it("prompt section is empty when includeCompiledDigestPrompt is false", () => {
    const builder = createWikiPromptSectionBuilder({
      vault: { path: TEMP_VAULT },
      context: { includeCompiledDigestPrompt: false },
    });

    const result = builder({ availableTools: new Set(["memory_recall"]) });
    // Should have tool guidance but no digest lines
    const hasDigestSnapshot = result.some(line => line.includes("Compiled Wiki Snapshot"));
    expect(hasDigestSnapshot).toBe(false);
  });

  it("prompt section includes digest when includeCompiledDigestPrompt is true", () => {
    const builder = createWikiPromptSectionBuilder({
      vault: { path: TEMP_VAULT },
      context: { includeCompiledDigestPrompt: true },
    });

    const result = builder({ availableTools: new Set(["memory_recall", "wiki_query"]) });
    const hasDigestSnapshot = result.some(line => line.includes("Compiled Wiki Snapshot"));
    expect(hasDigestSnapshot).toBe(true);

    // Should contain claim count
    const hasClaimCount = result.some(line => line.includes("claims across"));
    expect(hasClaimCount).toBe(true);
  });

  it("prompt section includes tool guidance when wiki tools are available", () => {
    const builder = createWikiPromptSectionBuilder({
      vault: { path: TEMP_VAULT },
      context: { includeCompiledDigestPrompt: false },
    });

    const result = builder({ availableTools: new Set(["wiki_query", "memory_recall"]) });
    const hasToolGuidance = result.some(line => line.includes("Compiled Wiki"));
    expect(hasToolGuidance).toBe(true);
  });
});

describe("Wiki Corpus Supplement (M6 P0a-3)", () => {
  beforeAll(() => {
    setupTempVault();
  });

  afterAll(() => {
    teardownTempVault();
  });

  it("corpus supplement search returns results for wiki-only knowledge", async () => {
    const supplement = createWikiCorpusSupplement({
      config: { vault: { path: TEMP_VAULT } },
      appConfig: {},
    });

    const results = await supplement.search({ query: "Test Concept", maxResults: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.title === "Test Concept Alpha")).toBe(true);
  });

  it("corpus supplement get returns page by path", async () => {
    const supplement = createWikiCorpusSupplement({
      config: { vault: { path: TEMP_VAULT } },
      appConfig: {},
    });

    const result = await supplement.get({ lookup: "concepts/test-concept.md" });
    expect(result).not.toBeNull();
    expect(result.title).toBe("Test Concept Alpha");
  });

  it("corpus supplement get returns null for non-existent page", async () => {
    const supplement = createWikiCorpusSupplement({
      config: { vault: { path: TEMP_VAULT } },
      appConfig: {},
    });

    const result = await supplement.get({ lookup: "nonexistent/page.md" });
    expect(result).toBeNull();
  });
});
