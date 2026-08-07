/**
 * M1 Benchmark Script — Phase A baseline & Phase D comparison
 *
 * Measures: (a) countRows total (b) vectorSearch p50/p95 latency (c) store+update latency
 * Usage: node scripts/bench-m1.mjs [before|after]
 * Output: scripts/bench-m1-{before|after}.json
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const lancedb = require('@lancedb/lancedb');

const DB_PATH = process.env.MEMORY_BENCH_DB || join(os.tmpdir(), 'memory-lancedb-pro', 'tmp-m1-test-db');
const TABLE_NAME = 'memories';
const PHASE = process.argv[2] || 'before';
const OUTPUT = join(__dirname, `bench-m1-${PHASE}.json`);

// Helpers
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log(`[bench-m1] Phase: ${PHASE}`);
  console.log(`[bench-m1] Connecting to ${DB_PATH}...`);

  const db = await lancedb.connect(DB_PATH);
  const table = await db.openTable(TABLE_NAME);

  // (a) countRows
  const totalRows = await table.countRows();
  console.log(`[bench-m1] Total rows: ${totalRows}`);

  // (b) vectorSearch latency — sample 10 random queries
  // First get some real embeddings to use as query vectors
  const sampleRows = await table.query().limit(10).toArray();
  const queryVectors = sampleRows
    .filter(r => r.embedding && r.embedding.length > 0)
    .map(r => Array.from(r.embedding));

  // Try to create vector index if not present (needed for 0.4 search)
  let indexCreated = false;
  try {
    const indices = await table.listIndices();
    console.log(`[bench-m1] Existing indices:`, JSON.stringify(indices));
    if (!indices || indices.length === 0) {
      console.log(`[bench-m1] Creating IVF-PQ index for benchmark...`);
      await table.createIndex('embedding', { config: lancedb.Index.ivfPq({ numPartitions: 10 }) });
      indexCreated = true;
    }
  } catch (idxErr) {
    console.warn(`[bench-m1] Index creation/check failed: ${idxErr.message}`);
  }

  const searchLatencies = [];
  for (const vec of queryVectors) {
    const start = performance.now();
    try {
      await table.vectorSearch(vec).limit(5).toArray();
    } catch (e) {
      console.warn(`[bench-m1] vectorSearch failed: ${e.message}`);
    }
    const elapsed = performance.now() - start;
    searchLatencies.push(elapsed);
  }

  const p50 = searchLatencies.length > 0 ? percentile(searchLatencies, 50) : -1;
  const p95 = searchLatencies.length > 0 ? percentile(searchLatencies, 95) : -1;
  console.log(`[bench-m1] Vector search latencies (ms): p50=${p50.toFixed(1)}, p95=${p95.toFixed(1)}`);

  // (c) store + update latency
  // Store a new record
  const storeStart = performance.now();
  const testId = `bench-${Date.now()}`;
  const testRow = {
    id: testId,
    scope: 'global',
    content: 'Benchmark test record for M1 migration',
    embedding: Array.from({ length: 2560 }).fill(0.01),
    category: 'other',
    importance: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: '{}',
  };
  await table.add([testRow]);
  const storeElapsed = performance.now() - storeStart;
  console.log(`[bench-m1] Store latency: ${storeElapsed.toFixed(1)}ms`);

  // Update (delete + add) the same record
  const updateStart = performance.now();
  await table.delete(`id = '${testId}'`);
  testRow.content = 'Benchmark test record UPDATED for M1 migration';
  testRow.updatedAt = new Date().toISOString();
  await table.add([testRow]);
  const updateElapsed = performance.now() - updateStart;
  console.log(`[bench-m1] Update (delete+add) latency: ${updateElapsed.toFixed(1)}ms`);

  // Cleanup
  await table.delete(`id = '${testId}'`);

  // Embedding dimension check
  const dimCheck = sampleRows.find(r => r.embedding && r.embedding.length > 0);
  const embeddingDim = dimCheck ? dimCheck.embedding.length : -1;
  console.log(`[bench-m1] Embedding dimension: ${embeddingDim}`);

  const result = {
    phase: PHASE,
    timestamp: new Date().toISOString(),
    dbPath: DB_PATH,
    totalRows,
    embeddingDimension: embeddingDim,
    vectorSearch: {
      sampleCount: searchLatencies.length,
      p50Ms: Math.round(p50 * 10) / 10,
      p95Ms: Math.round(p95 * 10) / 10,
      allLatenciesMs: searchLatencies.map(l => Math.round(l * 10) / 10),
    },
    storeLatencyMs: Math.round(storeElapsed * 10) / 10,
    updateDeleteAddLatencyMs: Math.round(updateElapsed * 10) / 10,
  };

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`[bench-m1] Results written to ${OUTPUT}`);
}

main().catch(err => {
  console.error('[bench-m1] FATAL:', err);
  process.exit(1);
});
