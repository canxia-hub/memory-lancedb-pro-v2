import lancedb from '@lancedb/lancedb';
import os from 'node:os';
import path from 'node:path';
const DB_PATH = process.env.MEMORY_TEST_DB || path.join(os.tmpdir(), 'memory-lancedb-pro', 'tmp-m1-test-db');
const db = await lancedb.connect(DB_PATH, { readConsistencyInterval: 1 });
const t = await db.openTable('memories__v4');
const schema = await t.schema();
const f = schema.fields.find(x => x.name === 'embedding');
console.log('embedding field:', String(f.type), 'nullable:', f.nullable);

const sample = (await t.query().limit(1).toArray())[0];
const v = new Float32Array(Array.from(sample.embedding));

// 变体1：generic search
try { const r = await t.search(v).limit(3).toArray(); console.log('search(vector):', r.length, r.map(x=>x._distance)); } catch (e) { console.log('search(vector) ERR:', e.message.slice(0,150)); }
// 变体2：number[] 查询向量
try { const r = await t.vectorSearch(Array.from(v)).distanceType('cosine').limit(3).toArray(); console.log('vectorSearch(number[]):', r.length); } catch (e) { console.log('vectorSearch(number[]) ERR:', e.message.slice(0,150)); }
// 变体3：L2 距离
try { const r = await t.vectorSearch(v).distanceType('l2').limit(3).toArray(); console.log('vectorSearch(l2):', r.length, r.map(x=>x._distance)); } catch (e) { console.log('vectorSearch(l2) ERR:', e.message.slice(0,150)); }
// 变体4：建 IVF_FLAT 索引后再搜
try {
  await t.createIndex('embedding', { config: lancedb.Index.ivfFlat({ distanceType: 'cosine', numPartitions: 4 }) });
  const r = await t.vectorSearch(v).distanceType('cosine').limit(3).toArray();
  console.log('vectorSearch(after ivfFlat):', r.length, r.map(x=>`${x.id?.slice(0,8)}:${x._distance}`));
} catch (e) { console.log('ivfFlat ERR:', e.message.slice(0,150)); }
