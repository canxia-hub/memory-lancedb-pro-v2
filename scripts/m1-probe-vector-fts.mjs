import lancedb from '@lancedb/lancedb';
const db = await lancedb.connect('C:\\Users\\Administrator\\.openclaw\\memory\\tmp-m1-test-db', { readConsistencyInterval: 1 });
const t = await db.openTable('memories');

// 1. schema 检查：embedding 列的实际类型
const schema = await t.schema();
const embField = schema.fields.find(f => f.name === 'embedding');
console.log('embedding field type:', embField ? String(embField.type) : 'MISSING');

// 2. 向量搜索：number[] vs Float32Array
const sample = await t.query().limit(1).toArray();
const plain = Array.from(sample[0].embedding);
console.log('sample embedding ctor:', sample[0].embedding?.constructor?.name, 'len:', plain.length);

for (const [label, v] of [['number[]', plain], ['Float32Array', new Float32Array(plain)]]) {
  try {
    const r = await t.vectorSearch(v).distanceType('cosine').limit(3).toArray();
    console.log(`vectorSearch(${label}) OK: hits=${r.length} topDist=${r[0]?._distance}`);
  } catch (e) { console.log(`vectorSearch(${label}) ERR: ${e.message.slice(0, 150)}`); }
}

// 3. FTS tokenizer 选项探测
const idx = lancedb.Index;
console.log('Index factories:', Object.getOwnPropertyNames(idx));
try { console.log('fts() config:', JSON.stringify(idx.fts())); } catch (e) { console.log('fts() ERR', e.message); }
// 列出已有索引
try { const indices = await t.listIndices(); console.log('listIndices:', JSON.stringify(indices)); } catch (e) { console.log('listIndices ERR', e.message.slice(0, 200)); }

// 4. FTS 重建索引（jieba tokenizer）再搜
try {
  await t.createIndex('content', { config: idx.fts({ tokenizer: 'jieba' }), replace: true });
  console.log('FTS recreate with jieba: OK');
} catch (e) { console.log('FTS jieba ERR:', e.message.slice(0, 200)); }
try {
  await t.optimize();
  console.log('optimize: OK');
} catch (e) { console.log('optimize ERR:', e.message.slice(0, 150)); }
const kw = '沧溟剑诀';
for (const mode of ['fts']) {
  try {
    const r = await t.search(kw, mode).limit(5).toArray();
    console.log(`fts search '${kw}': hits=${r.length}`, r.slice(0, 2).map(x => (x.content ?? '').slice(0, 25)));
  } catch (e) { console.log(`fts search ERR: ${e.message.slice(0, 150)}`); }
}
