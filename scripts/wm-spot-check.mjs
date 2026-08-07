// M4 对账：抽查任务字段完整性（fresh handle，只读）
// 默认只给示例；实际抽查用 WM_SPOT_CHECKS='[["agent:main","wm-..."]]' 指定。
import os from 'node:os';
import path from 'node:path';
import { createWorkingMemoryStore } from '../dist/store/working-memory-store.js';

const CHECKS = JSON.parse(process.env.WM_SPOT_CHECKS || '[["agent:main","wm-example-task"]]');
const dbPath = process.env.MEMORY_DB_PATH || path.join(os.homedir(), '.openclaw', 'memory', 'memory-lancedb-pro-v4');

const store = createWorkingMemoryStore({
    dbPath,
    tableName: 'working_memory',
});
await store.initialize();
for (const [scope, taskId] of CHECKS) {
    const r = await store.getByTaskId(scope, taskId);
    if (!r) { console.log(`✗ ${scope}/${taskId}: NOT FOUND`); continue; }
    console.log(`✓ ${scope}/${r.task_id}`);
    console.log(`  status=${r.status} priority=${r.priority} created=${r.created_at} updated=${r.updated_at}`);
    console.log(`  completed_at=${r.completed_at || '-'} archived_at=${r.archived_at || '-'}`);
    console.log(`  goal(${r.goal.length}ch) outcome(${r.outcome.length}ch) notes(${r.notes.length}ch) current_step=${r.current_step}`);
    console.log(`  arrays: plan=${r.plan.length} decisions=${r.decisions.length} learnings=${r.learnings.length} risks=${r.risks.length} blockers=${r.blockers.length} artifacts=${r.artifacts.length} next_actions=${r.next_actions.length}`);
    if (r.plan.length > 0) console.log(`  plan[0]: ${JSON.stringify(r.plan[0]).slice(0, 120)}`);
    if (r.decisions.length > 0) console.log(`  decisions[0]: ${String(r.decisions[0]).slice(0, 120)}`);
}
await store.close();
process.exit(0);
