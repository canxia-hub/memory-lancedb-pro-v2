import { createRequire } from 'node:module';
const lancedb = createRequire(import.meta.url)('@lancedb/lancedb');

async function test() {
  const db = await lancedb.connect('C:\\Users\\Administrator\\.openclaw\\memory\\tmp-m1-test-db');
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
