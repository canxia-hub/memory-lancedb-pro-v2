// Repair char-mangled metadata rows in production DB (2026-08-03 REM sweep bug).
// Run ONLY while Gateway is stopped (LanceDB single-writer safety).
// Modes:
//   --dry-run            scan + spell-check only, no writes
//   (default)            backup originals -> repair via fixed store.update -> verify
//   --rollback <file>    restore original metadata strings from a backup JSON
// Exit codes: 0 = success / VERIFY_CLEAN, 2 = repair or verify failed, 3 = rollback failed
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const BASE = 'C:/Users/Administrator/.openclaw/extensions/memory-lancedb-pro-v3/dist';
const DB_PATH = 'C:/Users/Administrator/.openclaw/memory/memory-lancedb-pro-v2';
const BACKUP_DIR = 'C:/Users/Administrator/.openclaw/memory/backups';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const rollbackIdx = args.indexOf('--rollback');
const ROLLBACK_FILE = rollbackIdx >= 0 ? args[rollbackIdx + 1] : null;

const { createLanceDBStore } = await import(pathToFileURL(`${BASE}/store/lancedb-store.js`).href);
const lancedb = await import(pathToFileURL('C:/Users/Administrator/.openclaw/extensions/memory-lancedb-pro-v3/node_modules/@lancedb/lancedb/dist/index.js').href);

function isMangled(metadataStr) {
  if (typeof metadataStr !== 'string') return null;
  let m;
  try { m = JSON.parse(metadataStr); } catch { return null; }
  if (m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, '0') && typeof m['0'] === 'string' && m['0'].length <= 1) return m;
  return null;
}
function spellCharObject(m) {
  const numKeys = Object.keys(m).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  let s = '';
  for (const i of numKeys) s += m[String(i)] ?? '';
  return s;
}

const ldb = await lancedb.connect(DB_PATH);
const table = await ldb.openTable('memories');

// ── Rollback mode ────────────────────────────────────────────────
if (ROLLBACK_FILE) {
  const backup = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
  const store = createLanceDBStore({ dbPath: DB_PATH, tableName: 'memories', embeddingDimension: 2560 });
  await store.initialize();
  let ok = 0, fail = 0;
  for (const row of backup.rows) {
    // original metadata was a string; fixed update() writes strings verbatim
    const res = await store.update(row.id, { metadata: row.metadata }, row.scope);
    if (res) ok++; else { fail++; console.log('  rollback FAIL:', row.id.slice(0, 13)); }
  }
  console.log(`rollback applied: ${ok} ok, ${fail} fail (from ${ROLLBACK_FILE})`);
  await store.close();
  process.exit(fail === 0 ? 0 : 3);
}

// ── Scan ─────────────────────────────────────────────────────────
const rows = await table.query().select(['id', 'scope', 'metadata']).toArray();
const targets = [];
for (const r of rows) {
  const m = isMangled(r.metadata);
  if (!m) continue;
  const spelled = spellCharObject(m);
  let repaired;
  try { repaired = JSON.parse(spelled); } catch (e) { console.log('SKIP unparseable:', r.id.slice(0, 13), e.message); continue; }
  // Preserve non-numeric keys merged onto the mangled object (e.g. light-phase
  // archive marks merged by patchMetadata AFTER the row was mangled — dropping
  // them silently erases archive state, observed 2026-08-03 on 3 REM rows).
  for (const [k, v] of Object.entries(m)) {
    if (!/^\d+$/.test(k) && repaired[k] === undefined) repaired[k] = v;
  }
  targets.push({ id: r.id, scope: r.scope, originalMetadata: r.metadata, repaired });
}

console.log('mangled rows found:', targets.length, DRY_RUN ? '(dry-run, no writes)' : '');
for (const t of targets) {
  console.log(' ', t.id.slice(0, 13), '| scope:', t.scope, '| keys:', Object.keys(t.repaired).join(','));
}
if (DRY_RUN || targets.length === 0) {
  if (!DRY_RUN && targets.length === 0) console.log('VERIFY_CLEAN (nothing to repair)');
  process.exit(0);
}

// ── Backup originals ─────────────────────────────────────────────
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backupPath = `${BACKUP_DIR}/m8-mangled-metadata-backup-${ts}.json`;
fs.writeFileSync(backupPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  rows: targets.map(t => ({ id: t.id, scope: t.scope, metadata: t.originalMetadata })),
}, null, 2));
console.log('backup written:', backupPath);

// ── Repair via fixed store path ──────────────────────────────────
const store = createLanceDBStore({ dbPath: DB_PATH, tableName: 'memories', embeddingDimension: 2560 });
await store.initialize();
let ok = 0, fail = 0;
for (const t of targets) {
  const res = await store.update(t.id, { metadata: t.repaired }, t.scope);
  if (res) ok++; else { fail++; console.log('  FAIL update:', t.id.slice(0, 13)); }
}
console.log('repaired:', ok, '| failed:', fail);

// ── Verify: re-scan with a FRESH table handle ────────────────────
// LanceDB table objects snapshot the version at open time: the handle used
// for the initial scan cannot see mergeInsert commits made by the store
// (proven 2026-08-03: T1 stale/empty vs T2 fresh). Must re-open.
await store.close();
const ldb2 = await lancedb.connect(DB_PATH);
const table2 = await ldb2.openTable('memories');
const rows2 = await table2.query().select(['id', 'metadata']).toArray();
let still = 0;
for (const r of rows2) { if (isMangled(r.metadata)) still++; }

if (fail === 0 && still === 0) {
  console.log('VERIFY_CLEAN');
  process.exit(0);
}
console.log(`VERIFY_FAILED (update failures=${fail}, still mangled=${still})`);
process.exit(2);
