import lancedb from '@lancedb/lancedb';
const db = await lancedb.connect('C:\\Users\\Administrator\\.openclaw\\memory\\tmp-m1-test-db', { readConsistencyInterval: 1 });
const t = await db.openTable('memories__v4');
console.log('count:', await t.countRows());
const rows = await t.query().limit(3).toArray();
for (const r of rows) {
  console.log('row', r.id?.slice(0, 8), 'emb:', r.embedding ? `${r.embedding.constructor.name} len=${r.embedding.length}` : 'NULL');
}
const sample = rows.find(r => r.embedding && r.embedding.length === 2560);
if (sample) {
  const v = new Float32Array(Array.from(sample.embedding));
  for (const extra of ['plain', 'bypass']) {
    try {
      let q = t.vectorSearch(v).distanceType('cosine').limit(3);
      if (extra === 'bypass') q = q.bypassVectorIndex();
      const r = await q.toArray();
      console.log(`search(${extra}): hits=${r.length}`, r.map(x => `${x.id?.slice(0, 8)}:${x._distance}`));
    } catch (e) { console.log(`search(${extra}) ERR: ${e.message.slice(0, 160)}`); }
  }
  // 非空向量行数
  const cnt = await t.countRows('embedding IS NOT NULL');
  console.log('rows with embedding:', cnt);
}
