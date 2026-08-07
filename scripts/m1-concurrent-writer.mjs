
import { createLanceDBStore } from '../dist/store/lancedb-store.js';
import os from 'node:os';
import path from 'node:path';
const tag = process.argv[2];
const dbPath = process.env.MEMORY_TEST_DB || path.join(os.tmpdir(), 'memory-lancedb-pro', 'tmp-m1-smoke-db');
const s = createLanceDBStore({ dbPath, connectionMode: 'embedded', tableName: 'memories', embeddingDimension: 2560, readConsistencyIntervalSeconds: 1 });
await s.initialize();
for (let i = 0; i < 20; i++) { await s.create({ content: 'concurrent-' + tag + '-' + i, category: 'other', importance: 0.1, scope: 'global' }); }
await s.close();
console.log(tag + ' done');
