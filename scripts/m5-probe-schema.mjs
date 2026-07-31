import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');

async function main() {
  const tmpDir = path.join(os.tmpdir(), `probe-${Date.now()}`);
  const db = await lancedb.connect(tmpDir);
  const { Field, FixedSizeList, Float32, Schema, Utf8, Float64 } = arrow;
  const schema = new Schema([
    new Field('id', new Utf8(), false),
    new Field('scope', new Utf8(), false),
    new Field('content', new Utf8(), false),
    new Field('embedding', new FixedSizeList(2560, new Field('item', new Float32(), true)), true),
    new Field('category', new Utf8(), false),
    new Field('importance', new Float64(), false),
    new Field('createdAt', new Utf8(), false),
    new Field('updatedAt', new Utf8(), false),
    new Field('metadata', new Utf8(), false),
  ]);
  await db.createEmptyTable('memories', schema, { existOk: true });
  const table = await db.openTable('memories');
  const s = await table.schema();
  for (const f of s.fields) {
    console.log(`Field: ${f.name}, type: ${f.type}, toString: ${String(f.type)}`);
  }
  
  try {
    const indices = await table.listIndices();
    console.log('Indices:', JSON.stringify(indices));
  } catch(e) {
    console.log('listIndices error:', e.message?.slice(0,100));
  }
  
  const zeroVec = Array.from({length:2560}, ()=>0.0);
  await table.add([{
    id: 'test-1', scope: 'test', content: 'Conversation info (untrusted metadata): test',
    embedding: zeroVec, category: 'other', importance: 0.5,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: '{}'
  }]);
  
  for await (const batch of table.query().select(['id','content'])) {
    const rows = batch.toArray();
    console.log('Scanned rows:', rows.length, 'first id:', rows[0]?.id, 'first content:', rows[0]?.content?.slice(0,50));
  }
  
  await table.delete("id IN ('test-1')");
  const count = await table.countRows();
  console.log('After delete count:', count);
  
  for await (const batch of table.query().select(['id','content'])) {
    const rows = batch.toArray();
    console.log('After delete scan rows:', rows.length);
  }
  
  await db.close();
  fs.rmSync(tmpDir, {recursive: true, force: true});
}
main().catch(e => { console.error(e); process.exit(1); });
