import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const lancedb = createRequire(import.meta.url)('@lancedb/lancedb');
const DB_PATH = process.env.MEMORY_TEST_DB || path.join(os.tmpdir(), 'memory-lancedb-pro', 'tmp-m1-test-db');

async function test() {
  const db = await lancedb.connect(DB_PATH);
  const t = await db.openTable('memories');
  
  // Get a known record
  const sample = await t.query().limit(1).toArray();
  const id = sample[0].id;
  const scope = sample[0].scope;
  console.log('Test record:', id, 'scope:', scope);
  
  // Single where by id
  const r1 = await t.query().where(`id = '${id}'`).limit(1).toArray();
  console.log('Single where (id only):', r1.length);
  
  // Two where calls: id AND scope (0.30+ AND semantics)
  const r2 = await t.query().where(`id = '${id}'`).where(`scope = '${scope}'`).limit(1).toArray();
  console.log('Double where (id AND scope):', r2.length);
  
  // Two where calls: id AND wrong scope (should return 0)
  const r3 = await t.query().where(`id = '${id}'`).where(`scope = 'NONEXISTENT'`).limit(1).toArray();
  console.log('Double where (id AND wrong scope):', r3.length);
  
  // Single combined where
  const r4 = await t.query().where(`id = '${id}' AND scope = '${scope}'`).limit(1).toArray();
  console.log('Single combined where:', r4.length);
}

test().catch(e => console.error('ERROR:', e.message));
