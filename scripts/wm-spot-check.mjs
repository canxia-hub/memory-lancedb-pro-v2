// M4 对账：抽查 3 条复杂任务字段完整性（fresh handle，只读）
import { createWorkingMemoryStore } from '../dist/store/working-memory-store.js';

const CHECKS = [
    ['agent:main', 'wm-2026-07-30-memory-plugin-v4-upgrade'],
    ['agent:tuan', 'dreamina-cli-official-guide-skill-plugin-20260625'],
    ['agent:intel-analyst', 'skill-improvement-knowledge-resource-collector'],
];

const store = createWorkingMemoryStore({
    dbPath: 'C:/Users/Administrator/.openclaw/memory/memory-lancedb-pro-v2',
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
