// 只读验证：working_memory 表现状（fresh handle）
import { createWorkingMemoryStore } from '../dist/store/working-memory-store.js';

const store = createWorkingMemoryStore({
    dbPath: 'C:/Users/Administrator/.openclaw/memory/memory-lancedb-pro-v2',
    tableName: 'working_memory',
});
await store.initialize();
const status = await store.status();
console.log('status:', JSON.stringify(status));
const overview = await store.laneOverview();
console.log('lanes:', JSON.stringify(overview.lanes, null, 1));
await store.close();
process.exit(0);
