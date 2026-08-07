// M1 Phase D 补全验证：端到端 smoke + FTS + 跨连接可见性 + bench-after
// 主线程（小千）在 sub-agent 提前结束后亲自执行
import { createLanceDBStore } from '../dist/store/lancedb-store.js';
import { copyFileSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const TMP_ROOT = process.env.MEMORY_TEST_TMP || path.join(os.tmpdir(), 'memory-lancedb-pro');
const SMOKE_DB = process.env.MEMORY_SMOKE_DB || path.join(TMP_ROOT, 'tmp-m1-smoke-db');
const COPY_DB = process.env.MEMORY_TEST_DB || path.join(TMP_ROOT, 'tmp-m1-test-db');
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

// ---- A. 全新库 CRUD + mergeInsert + 跨连接可见性 ----
rmSync(SMOKE_DB, { recursive: true, force: true });
const cfg = (p) => ({ dbPath: p, connectionMode: 'embedded', tableName: 'memories', embeddingDimension: 2560, readConsistencyIntervalSeconds: 1, retrieval: { fts: true } });
const s1 = createLanceDBStore(cfg(SMOKE_DB));
await s1.initialize();
const st = await s1.status();
record('A0 fresh init', st.connected === true, `total=${st.totalRecords}`);

const c1 = await s1.create({ content: '小千的 M1 验证记忆：沧溟剑诀', category: 'fact', importance: 0.9, scope: 'global' });
record('A1 create', typeof c1.id === 'string' && c1.id.length > 0, `id=${c1.id}`);

const g1 = await s1.get(c1.id, 'global');
record('A2 get', g1?.content.includes('沧溟剑诀') === true, g1?.content);

const u1 = await s1.update(c1.id, { content: '小千的 M1 验证记忆：沧溟剑诀·改', importance: 0.95 }, 'global');
record('A3 update(mergeInsert)', u1?.content.endsWith('·改') === true && u1.importance === 0.95, `content=${u1?.content} imp=${u1?.importance}`);

// 跨连接可见性（第二个实例应读到）
const s2 = createLanceDBStore(cfg(SMOKE_DB));
await s2.initialize();
const g2 = await s2.get(c1.id, 'global');
record('A4 cross-connection visibility', g2?.content.endsWith('·改') === true, g2?.content ?? 'null');

const d1 = await s1.delete(c1.id, 'global');
const g3 = await s1.get(c1.id, 'global');
record('A5 delete', d1 === true && g3 === null, `deleted=${d1} get=${g3}`);
await s1.close(); await s2.close();

// ---- B. 生产副本：状态 + FTS + 向量 ----
const s3 = createLanceDBStore(cfg(COPY_DB));
await s3.initialize();
const st3 = await s3.status();
record('B0 prod-copy status', st3.totalRecords >= 760, `total=${st3.totalRecords} dim=${st3.embeddingDimension} fts=${st3.ftsAvailable} ftsErr=${st3.ftsError ?? 'none'}`);

// FTS：插入独特关键词再检索
const kw = await s3.create({ content: 'M1验证专用：沧溟剑诀第三式·断水流', category: 'other', importance: 0.1, scope: 'global' });
await new Promise(r => setTimeout(r, 2000)); // 等 FTS 索引可见
let ftsHit = false, ftsDetail = '';
try {
  const ftsRes = await s3.table.search('沧溟剑诀', 'fts').limit(5).toArray();
  ftsHit = ftsRes.some(r => (r.content ?? '').includes('沧溟剑诀'));
  ftsDetail = `hits=${ftsRes.length} top=${ftsRes[0]?.content?.slice(0, 30) ?? 'none'}`;
} catch (e) { ftsDetail = `ERR ${e.message}`; }
record('B1 FTS search', ftsHit, ftsDetail);

// 向量：用既有行 embedding 自搜（跳过零范数行——cosine 对零向量无定义）
const candidates = await s3.table.query().limit(50).toArray();
const sample = candidates.find(r => {
  const v = Array.from(r.embedding ?? []);
  return v.length === 2560 && Math.sqrt(v.reduce((s, x) => s + x * x, 0)) > 0.5;
});
const vec = new Float32Array(Array.from(sample.embedding));
let vHit = false, vDetail = '';
try {
  const vRes = await s3.table.vectorSearch(vec).distanceType('cosine').limit(3).toArray();
  vHit = vRes.length > 0 && vRes[0].id === sample.id;
  vDetail = `hits=${vRes.length} topIdMatch=${vRes[0]?.id === sample.id} dist=${vRes[0]?._distance}`;
} catch (e) { vDetail = `ERR ${e.message}`; }
record('B2 vector cosine native', vHit, vDetail);

// bench-after：10 次随机向量搜索
const lat = [];
const rows = await s3.table.query().limit(10).toArray();
for (const r of rows) {
  const t0 = performance.now();
  await s3.table.vectorSearch(Array.from(r.embedding)).distanceType('cosine').limit(5).toArray();
  lat.push(+(performance.now() - t0).toFixed(1));
}
lat.sort((a, b) => a - b);
record('B3 bench-after vectorSearch', true, `p50=${lat[Math.floor(lat.length / 2)]}ms p95=${lat[Math.floor(lat.length * 0.95)]}ms all=[${lat.join(',')}]`);

await s3.delete(kw.id, 'global');
await s3.close();

// ---- C. 双进程并发写入 ----
const writer = `
import { createLanceDBStore } from '${new URL('../dist/store/lancedb-store.js', import.meta.url).href}';
const tag = process.argv[2];
const s = createLanceDBStore({ dbPath: '${SMOKE_DB.replaceAll('\\', '\\\\')}', connectionMode: 'embedded', tableName: 'memories', embeddingDimension: 2560, readConsistencyIntervalSeconds: 1 });
await s.initialize();
for (let i = 0; i < 20; i++) { await s.create({ content: 'concurrent-' + tag + '-' + i, category: 'other', importance: 0.1, scope: 'global' }); }
await s.close();
console.log(tag + ' done');
`;
const { writeFileSync } = await import('node:fs');
writeFileSync('scripts\\m1-concurrent-writer.mjs', writer);
let cPass = false, cDetail = '';
try {
  const out1 = execFileSync('node', ['scripts\\m1-concurrent-writer.mjs', 'P1'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 });
  const out2 = execFileSync('node', ['scripts\\m1-concurrent-writer.mjs', 'P2'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 });
  cDetail = `${out1.trim()} / ${out2.trim()}`;
  cPass = true;
} catch (e) { cDetail = `ERR ${e.message.slice(0, 200)}`; }
record('C1 concurrent writes (serial procs)', cPass, cDetail);

const s4 = createLanceDBStore(cfg(SMOKE_DB));
await s4.initialize();
const all = await s4.list({ limit: 100 });
const p1c = all.filter(r => r.content.startsWith('concurrent-P1-')).length;
const p2c = all.filter(r => r.content.startsWith('concurrent-P2-')).length;
record('C2 concurrent row counts', p1c === 20 && p2c === 20, `P1=${p1c} P2=${p2c}`);
await s4.close();

const failed = results.filter(r => !r.pass);
console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASS ===`);
if (failed.length) { console.log('FAILED:', failed.map(f => f.name).join(', ')); process.exit(1); }
