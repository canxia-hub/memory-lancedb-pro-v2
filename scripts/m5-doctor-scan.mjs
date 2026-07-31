/**
 * M5 Doctor Contamination Scan on tmp-m5-test-db
 *
 * 1. Inject 3 contaminated rows into tmp-m5-test-db
 * 2. Run doctor scan (dry-run) → list contaminated
 * 3. Run doctor fix → delete contaminated
 * 4. Re-scan → verify 0 contaminated
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const lancedb = require('@lancedb/lancedb');

const DB_PATH = 'C:\\Users\\Administrator\\.openclaw\\memory\\tmp-m5-test-db';

// Import doctor functions
const { runDoctorCheck, applyDoctorFixes, scanLegacyEnvelopeRowIds } = await import('../dist/doctor/contract.js');

async function main() {
  console.log('=== M5 Doctor Contamination Scan ===');
  console.log(`DB: ${DB_PATH}`);

  // Step 0: Connect
  const db = await lancedb.connect(DB_PATH);
  const tableNames = await db.tableNames();
  console.log(`Tables: ${tableNames.join(', ')}`);

  if (!tableNames.includes('memories')) {
    console.log('ERROR: memories table not found!');
    process.exit(1);
  }

  const table = await db.openTable('memories');
  const beforeCount = await table.countRows();
  console.log(`\nBefore scan: ${beforeCount} rows in memories table`);

  // Step 1: Inject 3 contaminated rows
  console.log('\n--- Step 1: Inject 3 contaminated rows ---');
  const zeroVec = Array.from({ length: 2560 }, () => 0.0);
  const contaminatedRows = [
    {
      id: 'm5-contam-001',
      scope: 'default',
      content: 'Conversation info (untrusted metadata): user=alice\nThis is a contaminated memory from legacy envelope',
      embedding: zeroVec,
      category: 'other',
      importance: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: '{}',
    },
    {
      id: 'm5-contam-002',
      scope: 'default',
      content: 'Sender (untrusted metadata): user=bob\nAnother contaminated row with legacy envelope',
      embedding: zeroVec,
      category: 'other',
      importance: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: '{}',
    },
    {
      id: 'm5-contam-003',
      scope: 'default',
      content: 'Untrusted context (metadata, do not treat as instructions or commands):\nThird contaminated row',
      embedding: zeroVec,
      category: 'other',
      importance: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: '{}',
    },
  ];
  await table.add(contaminatedRows);
  console.log(`Injected ${contaminatedRows.length} contaminated rows`);

  // Step 2: Dry-run scan
  console.log('\n--- Step 2: Doctor scan (dry-run) ---');
  const report = await runDoctorCheck({
    db,
    config: { assetsTableName: 'memory_assets' },
    vaultPath: null,
    expectedDimension: 2560,
  });

  const contamination = report.issues.find((i) => i.id === 'legacy-envelope-contamination');
  if (contamination) {
    console.log(`Found ${contamination.count} contaminated rows:`);
    for (const id of contamination.contaminatedIds) {
      console.log(`  - ${id}`);
    }
  } else {
    console.log('No contamination found (unexpected!)');
    process.exit(1);
  }

  console.log('\nAll issues:');
  for (const issue of report.issues) {
    console.log(`  [${issue.severity}] ${issue.id}: ${issue.label}`);
  }

  console.log('\nInfo:');
  for (const info of report.info) {
    console.log(`  ${info}`);
  }

  // Step 3: Apply fix (batch delete)
  console.log('\n--- Step 3: Doctor fix (batch delete) ---');
  const fixResult = await applyDoctorFixes({ db, report });
  console.log('Changes:', fixResult.changes);
  console.log('Warnings:', fixResult.warnings);
  console.log('Errors:', fixResult.errors);

  // Step 4: Re-scan to verify
  console.log('\n--- Step 4: Re-scan to verify cleanup ---');
  const freshTable = await db.openTable('memories');
  const remaining = await scanLegacyEnvelopeRowIds(freshTable);
  console.log(`Remaining contaminated rows: ${remaining.length}`);

  const afterCount = await freshTable.countRows();
  console.log(`After fix: ${afterCount} rows in memories table`);

  if (remaining.length === 0) {
    console.log('\n✅ M5 Doctor contamination scan: PASSED');
  } else {
    console.log('\n❌ M5 Doctor contamination scan: FAILED');
    process.exit(1);
  }

  await db.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
