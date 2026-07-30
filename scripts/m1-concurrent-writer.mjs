
import { createLanceDBStore } from 'file:///C:/Users/Administrator/.openclaw/extensions/memory-lancedb-pro-v3/dist/store/lancedb-store.js';
const tag = process.argv[2];
const s = createLanceDBStore({ dbPath: 'C:\\Users\\Administrator\\.openclaw\\memory\\tmp-m1-smoke-db', connectionMode: 'embedded', tableName: 'memories', embeddingDimension: 2560, readConsistencyIntervalSeconds: 1 });
await s.initialize();
for (let i = 0; i < 20; i++) { await s.create({ content: 'concurrent-' + tag + '-' + i, category: 'other', importance: 0.1, scope: 'global' }); }
await s.close();
console.log(tag + ' done');
