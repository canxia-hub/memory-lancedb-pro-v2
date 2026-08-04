// M7 停机窗口用：独立执行 doctor 污染清理（不依赖 Gateway）
// 用法: node scripts/m7-doctor-fix.mjs <dbPath> [--dry]
import lancedb from '@lancedb/lancedb';
import { runDoctorCheck, applyDoctorFixes } from '../dist/doctor/contract.js';

const dbPath = process.argv[2];
const dry = process.argv.includes('--dry');
if (!dbPath) { console.error('usage: node m7-doctor-fix.mjs <dbPath> [--dry]'); process.exit(1); }

const db = await lancedb.connect(dbPath, { readConsistencyInterval: 1 });
const report = await runDoctorCheck({ db, config: {}, vaultPath: null, expectedDimension: 2560 });
console.log(`issues=${report.issues.length} info=${report.info.length}`);
for (const i of report.info) console.log(`  info: ${i}`);
for (const i of report.issues) console.log(`  issue: [${i.severity}] ${i.label} fixable=${i.fixable}`);

const contamination = report.issues.find(x => x.id === 'legacy-envelope-contamination');
if (!contamination) { console.log('NO_CONTAMINATION'); process.exit(0); }
if (dry) { console.log(`DRY: would delete ${contamination.count} rows`); process.exit(0); }

const fix = await applyDoctorFixes({ db, report });
console.log('fix result:', JSON.stringify({ changes: fix.changes?.length, warnings: fix.warnings, errors: fix.errors }));

// 复查
const verify = await runDoctorCheck({ db, config: {}, vaultPath: null, expectedDimension: 2560 });
const still = verify.issues.find(x => x.id === 'legacy-envelope-contamination');
console.log(still ? `VERIFY_FAIL still=${still.count}` : 'VERIFY_CLEAN');
const t = await db.openTable('memories');
console.log(`final row count: ${await t.countRows()}`);
