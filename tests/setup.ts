/**
 * Test setup — shared context for memory-lancedb-pro v3 tests.
 */
import { beforeAll, afterAll } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";

/** Create a temp directory for LanceDB test data. */
export function createTempDbPath() {
  const tmpDir = path.join(os.tmpdir(), `lancedb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/** Remove a temp directory recursively. */
export function removeTempDbPath(dbPath) {
  try {
    fs.rmSync(dbPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

export const TEST_CONFIG = {
  dbPath: "", // set per-test
  connectionMode: "embedded",
  tableName: "test_memories",
  embeddingDimension: 2560,
  defaultScope: "test",
  retrieval: {
    hybrid: true,
    rerank: false,
    rerankProvider: "none",
    rerankModel: "qwen3-vl-rerank",
    rerankBaseUrl: "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    rerankApiKeyEnv: "DASHSCOPE_API_KEY",
  },
  hostInterop: {
    enableArtifacts: false,
    enableEvents: false,
  },
  assetsTableName: "test_assets",
  vault: { path: "" },
  context: { includeCompiledDigestPrompt: false },
  obsidian: { enabled: false },
  embedding: {
    provider: "dashscope",
    model: "tongyi-embedding-vision-flash-2026-03-06",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    nativeDimension: 768,
    storageDimension: 2560,
  },
};

/** Type-assert that the dist module is importable. */
export function assertModuleExists(mod, name) {
  if (!mod) {
    throw new Error(`Module ${name} failed to import`);
  }
}
