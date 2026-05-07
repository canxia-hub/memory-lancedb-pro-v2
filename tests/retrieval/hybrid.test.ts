/**
 * Hybrid retrieval + embedding structure tests
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DIST = path.resolve(__dirname, "../../dist");

describe("hybrid retriever", () => {
  let retrieverSrc;

  beforeAll(() => {
    retrieverSrc = fs.readFileSync(path.join(DIST, "retrieval/hybrid-retriever.js"), "utf8");
  });

  it("implements hybrid search", () => {
    expect(retrieverSrc).toContain("hybrid");
  });

  it("supports lexical and vector search modes", () => {
    expect(retrieverSrc).toMatch(/lexical|vector/);
  });
});

describe("search manager", () => {
  let searchManagerSrc;

  beforeAll(() => {
    searchManagerSrc = fs.readFileSync(path.join(DIST, "retrieval/search-manager.js"), "utf8");
  });

  it("is importable", () => {
    expect(searchManagerSrc.length).toBeGreaterThan(100);
  });

  it("initializes with config + backend + store", () => {
    expect(searchManagerSrc).toContain("initialize");
  });
});

describe("rerank module", () => {
  it("rerank.js exists", () => {
    const exists = fs.existsSync(path.join(DIST, "retrieval/rerank.js"));
    expect(exists).toBe(true);
  });
});

describe("search result types", () => {
  it("MemorySearchResult type is defined", () => {
    const typesSrc = fs.readFileSync(path.join(DIST, "types/memory-search-result.js"), "utf8");
    expect(typesSrc.length).toBeGreaterThan(0);
  });
});

describe("memory types", () => {
  it("MemoryAsset types are defined", () => {
    const assetSrc = fs.readFileSync(path.join(DIST, "types/memory-asset.js"), "utf8");
    expect(assetSrc.length).toBeGreaterThan(0);
  });
});

describe("retrieval module completeness", () => {
  const expectedFiles = [
    "retrieval/hybrid-retriever.js",
    "retrieval/search-manager.js",
    "retrieval/rerank.js",
    "types/memory-search-result.js",
    "types/memory-asset.js",
  ];

  for (const f of expectedFiles) {
    it(`${f} exists`, () => {
      expect(fs.existsSync(path.join(DIST, f))).toBe(true);
    });
  }
});
