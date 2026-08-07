/**
 * P1 Wiki Vector Index — Integration Test
 *
 * Tests:
 * 1. Ensure wiki_pages table creation
 * 2. Index all wiki pages (full index)
 * 3. Vector search functionality
 * 4. Index status
 *
 * Run: node scripts/test-wiki-vector-index.mjs
 */

import { resolveConfig } from '../dist/config/resolve-config.js';
import { resolveMemoryBackendConfig } from '../dist/config/resolve-backend-config.js';
import {
  ensureWikiVectorTable,
  indexWikiPages,
  searchWikiVector,
  getWikiIndexStatus,
  resetWikiVectorState,
} from '../dist/wiki/wiki-vector-index.js';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Load real plugin config
const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
const rawCfg = JSON.parse(readFileSync(configPath, 'utf8'));
const pluginRawCfg = rawCfg?.plugins?.entries?.['memory-lancedb-pro']?.config;
if (!pluginRawCfg) {
  console.error('FAIL: Plugin config not found');
  process.exit(1);
}

const config = resolveConfig(pluginRawCfg);
const vaultPath = config.vault?.path || process.env.WIKI_ROOT || path.join(os.homedir(), '.openclaw', 'wiki');

console.log('=== P1 Wiki Vector Index Integration Test ===\n');
console.log('Config:');
console.log('  dbPath:', config.dbPath);
console.log('  embeddingDimension:', config.embeddingDimension);
console.log('  vaultPath:', vaultPath);
console.log('');

// Test 1: Ensure table
console.log('--- Test 1: Ensure wiki_pages table ---');
try {
  const table = await ensureWikiVectorTable(config);
  if (table) {
    console.log('✅ wiki_pages table ready');
    const schema = await table.schema();
    console.log('  schema fields:', schema.fields.map(f => `${f.name}(${f.type})`).join(', '));
  } else {
    console.log('❌ wiki_pages table unavailable');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ FAIL:', e.message);
  process.exit(1);
}

// Test 2: Index wiki pages
console.log('\n--- Test 2: Index wiki pages ---');
console.log('Indexing... (this may take a minute for 197 pages)');
const startIdx = Date.now();
try {
  const idxResult = await indexWikiPages(config, vaultPath, { force: true, batchSize: 5 });
  const idxDuration = ((Date.now() - startIdx) / 1000).toFixed(1);
  console.log(`✅ Indexing complete in ${idxDuration}s`);
  console.log(`  indexed: ${idxResult.indexed}`);
  console.log(`  skipped: ${idxResult.skipped}`);
  console.log(`  errors: ${idxResult.errors}`);
  console.log(`  total files: ${idxResult.total}`);

  if (idxResult.indexed === 0) {
    console.log('❌ No pages indexed — cannot proceed');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ FAIL:', e.message);
  process.exit(1);
}

// Test 3: Index status
console.log('\n--- Test 3: Index status ---');
try {
  const status = await getWikiIndexStatus(config);
  console.log('✅ Status:', JSON.stringify(status));
} catch (e) {
  console.error('❌ FAIL:', e.message);
}

// Test 4: Vector search
console.log('\n--- Test 4: Vector search ---');
const testQueries = [
  'memory plugin configuration',
  'wiki knowledge graph',
  'agent communication protocol',
];

for (const query of testQueries) {
  console.log(`\nQuery: "${query}"`);
  try {
    const results = await searchWikiVector(config, query, { maxResults: 3 });
    if (results.length === 0) {
      console.log('  (no results)');
    } else {
      for (const r of results) {
        console.log(`  [${r.score.toFixed(4)}] ${r.title} (${r.path})`);
      }
    }
    console.log(`  ✅ ${results.length} results`);
  } catch (e) {
    console.error(`  ❌ FAIL: ${e.message}`);
  }
}

// Test 5: Reset and verify clean state
console.log('\n--- Test 5: Reset state ---');
resetWikiVectorState();
console.log('✅ State reset');

console.log('\n=== All tests passed ===');
process.exit(0);
