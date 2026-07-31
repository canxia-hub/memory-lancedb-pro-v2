/**
 * Doctor CLI Command Registration
 *
 * Registers `memory-lancedb-pro doctor` CLI command with subcommands:
 * - doctor scan (dry-run, default): list issues
 * - doctor fix: apply fixes (batch delete contaminated rows)
 *
 * Falls back from SDK PluginDoctorStateMigration (unavailable) to CLI.
 */
import { runDoctorCheck, applyDoctorFixes } from './contract.js';

function writeOutput(text, writer) {
  const target = writer ?? process.stdout;
  target.write(text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Open LanceDB connection for doctor operations.
 */
async function openDoctorDb(dbPath, storageOptions) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const lancedb = require('@lancedb/lancedb');
  const connectOpts = {};
  if (storageOptions && Object.keys(storageOptions).length > 0) {
    connectOpts.storageOptions = storageOptions;
  }
  return lancedb.connect(dbPath, connectOpts);
}

/**
 * Register doctor CLI commands.
 *
 * @param {object} program - Commander program instance
 * @param {object} config - Resolved plugin config
 * @param {object} appConfig - OpenClaw app config (optional)
 */
export function registerDoctorCli(program, config, appConfig) {
  if (!program || typeof program.command !== 'function') {
    console.warn('Doctor CLI registration skipped: program parameter invalid');
    return;
  }

  const doctor = program
    .command('doctor')
    .description('Memory LanceDB Pro doctor — schema validation & contamination cleanup');

  // doctor scan (dry-run)
  doctor
    .command('scan')
    .description('Scan for issues (dry-run, no modifications)')
    .option('--json', 'Output as JSON')
    .action(async (...args) => {
      const opts = args[args.length - 1];
      try {
        const dbPath = config.dbPath;
        const db = await openDoctorDb(dbPath, config.storageOptions);
        const report = await runDoctorCheck({
          db,
          config,
          vaultPath: config.vault?.path,
          expectedDimension: config.embeddingDimension ?? 2560,
        });
        if (opts.json) {
          writeOutput(JSON.stringify(report, null, 2));
        } else {
          writeOutput(formatReport(report));
        }
        try { await db.close(); } catch { /* best-effort */ }
        if (report.hasIssues) {
          process.exitCode = 1;
        }
      } catch (err) {
        writeOutput(opts.json
          ? JSON.stringify({ error: err.message }, null, 2)
          : `Error: ${err.message}`);
        process.exitCode = 2;
      }
    });

  // doctor fix
  doctor
    .command('fix')
    .description('Apply fixes (batch delete contaminated rows)')
    .option('--json', 'Output as JSON')
    .option('--dry-run', 'List what would be fixed without modifying')
    .action(async (...args) => {
      const opts = args[args.length - 1];
      try {
        const dbPath = config.dbPath;
        const db = await openDoctorDb(dbPath, config.storageOptions);
        const report = await runDoctorCheck({
          db,
          config,
          vaultPath: config.vault?.path,
          expectedDimension: config.embeddingDimension ?? 2560,
        });

        if (opts.dryRun) {
          const fixable = report.fixableIssues.map((i) => ({
            id: i.id,
            label: i.label,
            fixDescription: i.fixDescription,
            count: i.count,
          }));
          if (opts.json) {
            writeOutput(JSON.stringify({ dryRun: true, fixable }, null, 2));
          } else {
            writeOutput('Dry-run fix plan:\n' + fixable.map((f) => `  - [${f.id}] ${f.label}`).join('\n'));
          }
          try { await db.close(); } catch { /* best-effort */ }
          return;
        }

        const fixReport = await applyDoctorFixes({ db, report });
        if (opts.json) {
          writeOutput(JSON.stringify(fixReport, null, 2));
        } else {
          writeOutput(formatFixReport(fixReport));
        }
        try { await db.close(); } catch { /* best-effort */ }
        if (fixReport.errors.length > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        writeOutput(opts.json
          ? JSON.stringify({ error: err.message }, null, 2)
          : `Error: ${err.message}`);
        process.exitCode = 2;
      }
    });

  // Default action: run scan if no subcommand
  doctor
    .action(async (...args) => {
      const opts = args[args.length - 1] ?? {};
      try {
        const dbPath = config.dbPath;
        const db = await openDoctorDb(dbPath, config.storageOptions);
        const report = await runDoctorCheck({
          db,
          config,
          vaultPath: config.vault?.path,
          expectedDimension: config.embeddingDimension ?? 2560,
        });
        if (opts.json) {
          writeOutput(JSON.stringify(report, null, 2));
        } else {
          writeOutput(formatReport(report));
        }
        try { await db.close(); } catch { /* best-effort */ }
        if (report.hasIssues) {
          process.exitCode = 1;
        }
      } catch (err) {
        writeOutput(opts.json
          ? JSON.stringify({ error: err.message }, null, 2)
          : `Error: ${err.message}`);
        process.exitCode = 2;
      }
    });
}

function formatReport(report) {
  const lines = [
    'Memory LanceDB Pro Doctor',
    '═'.repeat(50),
    `Timestamp: ${report.timestamp}`,
    '',
  ];

  if (report.issues.length > 0) {
    lines.push(`Issues found: ${report.issues.length}`);
    lines.push('─'.repeat(50));
    for (const issue of report.issues) {
      lines.push(`  [${issue.severity.toUpperCase()}] ${issue.id}`);
      lines.push(`    ${issue.label}`);
      if (issue.fixable) {
        lines.push(`    Fix: ${issue.fixDescription}`);
      }
      lines.push('');
    }
  } else {
    lines.push('✅ No issues found.');
    lines.push('');
  }

  if (report.info.length > 0) {
    lines.push('Info:');
    lines.push('─'.repeat(50));
    for (const line of report.info) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n');
}

function formatFixReport(report) {
  const lines = [
    'Memory LanceDB Pro Doctor — Fix Report',
    '═'.repeat(50),
  ];
  if (report.changes.length > 0) {
    lines.push('Changes applied:');
    for (const c of report.changes) lines.push(`  ✅ ${c}`);
  }
  if (report.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push(`  ⚠️  ${w}`);
  }
  if (report.errors.length > 0) {
    lines.push('Errors:');
    for (const e of report.errors) lines.push(`  ❌ ${e}`);
  }
  if (report.changes.length === 0 && report.errors.length === 0) {
    lines.push('  Nothing to fix.');
  }
  return lines.join('\n');
}
