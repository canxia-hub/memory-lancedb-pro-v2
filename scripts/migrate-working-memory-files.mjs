#!/usr/bin/env node
/**
 * migrate-working-memory-files.mjs — 文件层 .working-memory/ → 插件 working_memory 表一次性迁移
 *
 * 用法：
 *   node scripts/migrate-working-memory-files.mjs            # dry-run（默认，零写入）
 *   node scripts/migrate-working-memory-files.mjs --run      # 正式迁移
 *   node scripts/migrate-working-memory-files.mjs --run --db <path>
 *
 * 设计：
 * - 扫描 8 个 workspace 的 .working-memory/{current-task.yaml, archive/*.yaml}
 * - workspace → 车道映射：workspace→agent:main，workspace-<id>→agent:<id>
 * - YAML 宽松解析（host node_modules 的 yaml 包）；未知字段并入 notes，不丢数据
 * - archive 文件 → status=archived，文件名日期 → archived_at
 * - skipExisting：重复 task_id+scope 跳过，可安全重跑
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createWorkingMemoryStore } from '../dist/store/working-memory-store.js';

const require = createRequire(import.meta.url);
const HOST_YAML = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/openclaw/node_modules/yaml';
const YAML = require(HOST_YAML);

const DEFAULT_DB = 'C:/Users/Administrator/.openclaw/memory/memory-lancedb-pro-v2';
const WORKSPACES = [
    { dir: 'C:/Users/Administrator/.openclaw/workspace', lane: 'agent:main' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-su-er', lane: 'agent:su-er' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-tuan', lane: 'agent:tuan' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-intel-analyst', lane: 'agent:intel-analyst' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-liu-hanyan', lane: 'agent:liu-hanyan' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-qinglan', lane: 'agent:qinglan' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-qian-tong', lane: 'agent:qian-tong' },
    { dir: 'C:/Users/Administrator/.openclaw/workspace-shu-shu', lane: 'agent:shu-shu' },
];

const KNOWN_FIELDS = new Set([
    'task_id', 'goal', 'status', 'priority', 'owner', 'source', 'outcome',
    'current_step', 'plan', 'decisions', 'learnings', 'risks', 'blockers',
    'artifacts', 'next_actions', 'notes', 'created_at', 'updated_at', 'completed_at',
]);
const ARRAY_FIELDS = ['plan', 'decisions', 'learnings', 'risks', 'blockers', 'artifacts', 'next_actions'];
const VALID_STATUS = ['planned', 'in_progress', 'blocked', 'completed', 'abandoned', 'archived'];

/** 宽松行级解析（严格 YAML 失败时的救援层）：正则提取已知标量字段，原文整体入 notes 不丢数据 */
function looseParse(raw) {
    const record = {};
    const scalarKeys = ['task_id', 'goal', 'status', 'priority', 'owner', 'source', 'outcome', 'created_at', 'updated_at', 'completed_at'];
    for (const key of scalarKeys) {
        const m = raw.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]*)["']?\\s*$`, 'm'));
        if (m && m[1] !== '') record[key] = m[1].trim();
    }
    return record;
}

function toStr(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v);
}

function toArray(v) {
    if (v === null || v === undefined) return [];
    return Array.isArray(v) ? v : [v];
}

/** 宽松解析 YAML 文件 → working_memory 记录 */
function parseFile(filePath, lane, { archived = false, archivedAt = '' } = {}) {
    const raw = fs.readFileSync(filePath, 'utf8');
    let doc;
    let salvaged = false;
    try {
        doc = YAML.parse(raw);
    } catch (err) {
        // 救援层：行级提取标量字段 + 原文入 notes
        const loose = looseParse(raw);
        if (!loose.task_id && !loose.goal) {
            // 彻底无法解析（纯 Markdown 笔记等）：文件名先生 task_id，原文入 notes
            const base = path.basename(filePath, '.yaml');
            const truncated = raw.length > 20000 ? raw.slice(0, 20000) + '\n...[截断]' : raw;
            return {
                record: {
                    scope: lane,
                    task_id: `wm-legacy-${base}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
                    status: 'archived',
                    archived_at: archivedAt,
                    notes: `[迁移救援：原文件为纯 Markdown/非 YAML，以下为原文]\n${truncated}`,
                },
            };
        }
        doc = loose;
        salvaged = true;
    }
    if (!doc || typeof doc !== 'object') {
        return { error: 'empty or non-object YAML' };
    }
    const record = { scope: lane };
    const unknown = [];
    for (const [key, value] of Object.entries(doc)) {
        if (ARRAY_FIELDS.includes(key)) {
            record[key] = toArray(value);
        } else if (key === 'current_step') {
            record.current_step = Number(value) || 0;
        } else if (KNOWN_FIELDS.has(key)) {
            record[key] = toStr(value);
        } else {
            unknown.push(`${key}: ${toStr(value)}`);
        }
    }
    if (salvaged) {
        const truncated = raw.length > 20000 ? raw.slice(0, 20000) + '\n...[截断]' : raw;
        record.notes = `[迁移救援：原文件非标准 YAML，以下为原文]\n${truncated}`;
    }
    if (!record.task_id) {
        // 历史文件缺 task_id 时用文件名兜底
        const base = path.basename(filePath, '.yaml');
        record.task_id = base.startsWith('wm-') ? base : `wm-legacy-${base}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
    if (unknown.length > 0 && !salvaged) {
        record.notes = [record.notes, `[迁移收纳未知字段] ${unknown.join(' | ')}`].filter(Boolean).join('\n');
    }
    if (archived) {
        record.status = 'archived';
        record.archived_at = archivedAt;
        if (!record.completed_at && (doc.status === 'completed' || doc.status === 'abandoned')) {
            record.completed_at = archivedAt;
        }
        if (!record.outcome) record.outcome = doc.status === 'abandoned' ? 'cancelled' : (toStr(doc.outcome) || 'success');
    } else if (!VALID_STATUS.includes(record.status)) {
        record.status = 'planned';
    }
    return { record };
}

/** 从归档文件名提取日期：YYYY-MM-DD-task_id.yaml → ISO +08:00 */
function archivedAtFromFilename(fileName) {
    const m = fileName.match(/^(\d{4})-(\d{2})-(\d{2})-/);
    return m ? `${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00` : '';
}

const SKIP_DIR_PATTERN = /[\\/](candidates|episode-like|packets)[\\/]/;

/** 递归收集 .working-memory 下全部 yaml（2026-08-07 全量退役版） */
function walkYaml(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkYaml(full));
        else if (entry.name.endsWith('.yaml')) out.push(full);
    }
    return out;
}

function collectFiles() {
    const items = [];
    for (const ws of WORKSPACES) {
        const wmDir = path.join(ws.dir, '.working-memory');
        for (const file of walkYaml(wmDir)) {
            const name = path.basename(file);
            // 模板不迁移（模板概念已由 store schema 承载）
            if (name.endsWith('.template.yaml')) continue;
            // 桥接层（candidates/episode-like/packets）禁入 LanceDB（桥接铁律），仅走文件备份
            if (SKIP_DIR_PATTERN.test(file)) continue;
            if (name === 'current-task.yaml') {
                const raw = fs.readFileSync(file, 'utf8');
                // 空白模板（task_id 为空）跳过
                if (/task_id:\s*["']?\s*["']?\s*$/m.test(raw) || /task_id:\s*["']{2}/m.test(raw)) continue;
                items.push({ file, lane: ws.lane, archived: false });
            } else {
                items.push({ file, lane: ws.lane, archived: true, archivedAt: archivedAtFromFilename(name) });
            }
        }
    }
    return items;
}

async function main() {
    const args = process.argv.slice(2);
    const isRun = args.includes('--run');
    const dbIdx = args.indexOf('--db');
    const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : DEFAULT_DB;

    console.log(`mode: ${isRun ? 'RUN (写入)' : 'DRY-RUN（零写入）'}`);
    console.log(`db:   ${dbPath}`);
    console.log('');

    const items = collectFiles();
    console.log(`扫描到 ${items.length} 个 YAML 文件：`);
    const report = [];
    const records = [];
    for (const item of items) {
        const rel = item.file.replace(/C:\/Users\/Administrator\/.openclaw\//, '');
        const { record, error } = parseFile(item.file, item.lane, { archived: item.archived, archivedAt: item.archivedAt });
        if (error) {
            report.push({ file: rel, lane: item.lane, error });
            continue;
        }
        records.push(record);
        report.push({
            file: rel,
            lane: item.lane,
            task_id: record.task_id,
            status: record.status,
            unknown: record.notes?.includes('[迁移收纳未知字段]') ? 'yes' : '',
            salvaged: record.notes?.includes('[迁移救援') ? 'yes' : '',
        });
    }
    for (const r of report) {
        console.log(`  ${r.error ? '✗' : '✓'} [${r.lane}] ${r.task_id ?? '-'} (${r.status ?? '-'})${r.unknown === 'yes' ? ' [未知字段→notes]' : ''}${r.salvaged === 'yes' ? ' [救援解析]' : ''}  ${r.error ?? r.file}`);
    }
    const okCount = report.filter((r) => !r.error).length;
    console.log(`\n解析：${okCount} 成功 / ${report.length - okCount} 失败`);

    if (!isRun) {
        console.log('\nDRY-RUN 完成，未写入。确认无误后加 --run 执行正式迁移。');
        return;
    }

    const store = createWorkingMemoryStore({ dbPath, tableName: 'working_memory' });
    await store.initialize();
    let imported = 0, skipped = 0, failed = 0;
    for (const record of records) {
        try {
            const res = await store.importRecord(record, { skipExisting: true });
            if (res.imported) imported++;
            else if (res.skipped) skipped++;
            else { failed++; console.log(`  ✗ ${record.task_id}: ${res.error}`); }
        } catch (err) {
            failed++;
            console.log(`  ✗ ${record.task_id}: ${err.message}`);
        }
    }
    await store.close();
    console.log(`\n迁移完成：imported=${imported} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
    console.error('迁移脚本失败:', err);
    process.exit(1);
});
