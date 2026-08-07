// 只读验证：working_memory 表现状（fresh handle）
import os from 'node:os';
import path from 'node:path';
import { createWorkingMemoryStore } from '../dist/store/working-memory-store.js';

const dbPath = process.env.MEMORY_DB_PATH || path.join(os.homedir(), '.openclaw', 'memory', 'memory-lancedb-pro-v4');
const store = createWorkingMemoryStore({
    dbPath,
    tableName: 'working_memory',
});
await store.initialize();
const status = await store.status();
console.log('status:', JSON.stringify(status));
const overview = await store.laneOverview();
console.log('lanes:', JSON.stringify(overview.lanes, null, 1));
await store.close();
process.exit(0);
