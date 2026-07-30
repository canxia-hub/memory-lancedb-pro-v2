// M1 数据迁移：把 0.4 时代的 List<Float64> 可变长向量列迁移为 0.33 要求的 FixedSizeList<Float32>
// 用法: node scripts/migrate-v4-vector-schema.mjs <dbPath> [--apply]
// 默认 dry-run（只检查不动数据）；--apply 才执行迁移
// 迁移策略：建新表(arrow schema) → 批量复制（embedding → Float32Array）→ 索引重建(jieba FTS + BITMAP)
//          → 行数校验 + 向量搜索验证 → 原子改名（旧表保留为 *_legacy_v3 回滚用）
import lancedb from '@lancedb/lancedb';
import { Field, FixedSizeList, Float32, Float64, Schema, Utf8 } from 'apache-arrow';

const dbPath = process.argv[2];
const apply = process.argv.includes('--apply');
if (!dbPath) { console.error('usage: node migrate-v4-vector-schema.mjs <dbPath> [--apply]'); process.exit(1); }

const DIM = 2560;
function memoriesSchema() {
  return new Schema([
    new Field('id', new Utf8(), false),
    new Field('scope', new Utf8(), false),
    new Field('content', new Utf8(), false),
    new Field('embedding', new FixedSizeList(DIM, new Field('item', new Float32(), true)), true),
    new Field('category', new Utf8(), false),
    new Field('importance', new Float64(), false),
    new Field('createdAt', new Utf8(), false),
    new Field('updatedAt', new Utf8(), false),
    new Field('metadata', new Utf8(), false),
  ]);
}
function assetsSchema() {
  return new Schema([
    new Field('assetId', new Utf8(), false),
    new Field('memoryId', new Utf8(), false),
    new Field('modality', new Utf8(), false),
    new Field('mimeType', new Utf8(), false),
    new Field('storagePath', new Utf8(), false),
    new Field('sha256', new Utf8(), true),
    new Field('sizeBytes', new Float64(), true),
    new Field('caption', new Utf8(), true),
    new Field('ocrText', new Utf8(), true),
    new Field('transcript', new Utf8(), true),
    new Field('summary', new Utf8(), true),
    new Field('embedding', new FixedSizeList(DIM, new Field('item', new Float32(), true)), true),
    new Field('createdAt', new Utf8(), false),
    new Field('metadataJson', new Utf8(), false),
  ]);
}
const TABLE_SPECS = {
  memories: { schema: memoriesSchema, ftsColumn: 'content', bitmapColumns: ['scope', 'category'], vectorColumn: 'embedding' },
  memory_assets: { schema: assetsSchema, ftsColumn: null, bitmapColumns: ['modality'], vectorColumn: 'embedding' },
};

function isLegacy(field) {
  if (!field) return false;
  const t = String(field.type ?? '');
  return /^List</.test(t) && !/FixedSizeList/.test(t);
}

const db = await lancedb.connect(dbPath, { readConsistencyInterval: 1 });
const tableNames = await db.tableNames();
console.log(`db: ${dbPath}`);
console.log(`tables: ${tableNames.join(', ')} | mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

for (const [name, spec] of Object.entries(TABLE_SPECS)) {
  if (!tableNames.includes(name)) { console.log(`\n[${name}] not present, skip`); continue; }
  const old = await db.openTable(name);
  const schema = await old.schema();
  const embField = schema.fields.find(f => f.name === spec.vectorColumn);
  console.log(`\n[${name}] embedding type: ${embField ? String(embField.type) : 'MISSING'}`);
  if (!isLegacy(embField)) { console.log(`[${name}] already FixedSizeList or no vector column, skip`); continue; }
  const rows = await old.query().toArray();
  console.log(`[${name}] legacy schema detected, rows=${rows.length}`);
  if (!apply) { console.log(`[${name}] dry-run, no changes`); continue; }

  const tmpName = `${name}__v4`;
  const legacyName = `${name}_legacy_v3`;
  for (const n of [tmpName, legacyName]) {
    if ((await db.tableNames()).includes(n)) { await db.dropTable(n); console.log(`[${name}] dropped stale ${n}`); }
  }
  const nt = await db.createEmptyTable(tmpName, spec.schema(), { existOk: true });
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(r => ({
      ...r,
      embedding: r.embedding && r.embedding.length > 0 ? new Float32Array(Array.from(r.embedding)) : null,
    }));
    await nt.add(batch);
    process.stdout.write(`\r[${name}] copied ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log('');
  const newCount = await nt.countRows();
  if (newCount !== rows.length) throw new Error(`[${name}] row count mismatch: old=${rows.length} new=${newCount}`);

  // 索引重建
  for (const col of spec.bitmapColumns) {
    try { await nt.createIndex(col, { config: lancedb.Index.bitmap() }); } catch (e) { console.log(`[${name}] bitmap ${col}: ${e.message.slice(0, 80)}`); }
  }
  if (spec.ftsColumn) {
    await nt.createIndex(spec.ftsColumn, {
      config: lancedb.Index.fts({ withPosition: true, baseTokenizer: 'icu', lowercase: true, stem: false, removeStopWords: false, asciiFolding: false }),
    });
  }

  // 向量搜索验证（选非零范数样本：cosine 对零向量无定义，会返回 0 命中）
  const sample = rows.find(r => {
    if (!r.embedding || r.embedding.length !== DIM) return false;
    const v = Array.from(r.embedding);
    return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) > 0.5;
  });
  if (sample) {
    const v = new Float32Array(Array.from(sample.embedding));
    const res = await nt.vectorSearch(v).distanceType('cosine').limit(1).toArray();
    const idKey = name === 'memories' ? 'id' : 'assetId';
    if (res[0]?.[idKey] !== sample[idKey]) throw new Error(`[${name}] vector self-search failed: top=${res[0]?.[idKey]} expect=${sample[idKey]}`);
    console.log(`[${name}] vector self-search OK (dist=${res[0]._distance})`);
  }

  // OSS 不支持 renameTable：由外部脚本在进程退出后做目录换名
  console.log(`[${name}] migrated ✓ pending FS swap: ${tmpName}.lance -> ${name}.lance (old -> ${legacyName}.lance)`);
  globalThis.__pendingSwaps = globalThis.__pendingSwaps ?? [];
  globalThis.__pendingSwaps.push({ name, tmpName, legacyName });
}
const swaps = globalThis.__pendingSwaps ?? [];
if (apply && swaps.length) {
  console.log('\n=== 进程退出后执行以下目录换名（PowerShell）===');
  for (const s of swaps) {
    console.log(`Rename-Item -LiteralPath '${dbPath}\\${s.name}.lance' -NewName '${s.legacyName}.lance' -Force`);
    console.log(`Rename-Item -LiteralPath '${dbPath}\\${s.tmpName}.lance' -NewName '${s.name}.lance' -Force`);
  }
}
console.log('\nDONE');
