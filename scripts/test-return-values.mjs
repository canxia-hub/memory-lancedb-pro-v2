import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const lancedb = createRequire(import.meta.url)('@lancedb/lancedb');
const DB_PATH = process.env.MEMORY_TEST_DB || path.join(os.tmpdir(), 'memory-lancedb-pro', 'tmp-m1-test-db');

async function test() {
  const db = await lancedb.connect(DB_PATH);
  const t = await db.openTable('memories');
  
  // Test add return value
  const addResult = await t.add([{ 
    id: 'test-ret-val', scope: 'global', content: 'test', 
    embedding: Array(2560).fill(0), category: 'other', importance: 0.5, 
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: '{}' 
  }]);
  console.log('add result type:', typeof addResult, 'keys:', Object.keys(addResult || {}).join(','));
  console.log('add result:', JSON.stringify(addResult));
  
  // Test delete return value
  const delResult = await t.delete("id = 'test-ret-val'");
  console.log('delete result type:', typeof delResult, 'value:', JSON.stringify(delResult));
}

test().catch(e => console.error('ERROR:', e.message));
