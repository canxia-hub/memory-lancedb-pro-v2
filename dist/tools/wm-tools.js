/**
 * Working Memory（工作任务）Tools - memory_wm_* 六工具
 *
 * 通过工具工厂绑定调用者车道（ctx.agentId → agent:<id>），实现：
 * - 写入隔离：非授权 agent 只能写自己的车道
 * - 跨车道只读：显式传 scope 可查看他人车道
 * - 主 Agent 代管：crossAgentWriteAllowlist（默认 ["main"]）可跨车道写
 *
 * 注册路径：register.js → registerWmTools(registerTool, deps)
 * 工厂返回 null 时宿主跳过该工具（enabled=false 灰度开关）。
 */
import {
    getWorkingMemoryStore,
    WM_ACTIVE_STATUSES,
    WM_ARRAY_FIELDS,
} from '../store/working-memory-store.js';

/** 与 hooks/auto-memory.js normalizeAgentId 保持一致（去掉前导非字母数字） */
function normalizeAgentId(agentId) {
    if (!agentId) return undefined;
    return agentId.replace(/^[^a-zA-Z0-9]+/, '');
}

/** ctx.agentId → 车道 scope；缺失时降级 defaultScope，保证工具可用 */
export function resolveLane(ctx, config) {
    const id = normalizeAgentId(ctx?.agentId);
    return id ? `agent:${id.toLowerCase()}` : (config?.defaultScope ?? 'default');
}

/** 是否在跨车道写白名单（主 Agent 代管权） */
export function isAdminLane(ctx, config) {
    const id = normalizeAgentId(ctx?.agentId)?.toLowerCase();
    if (!id) return false;
    const allow = config?.workingMemory?.crossAgentWriteAllowlist ?? ['main'];
    return allow.map((s) => String(s).toLowerCase()).includes(id);
}

/**
 * 写操作车道断言：目标 scope 必须等于本车道，除非在白名单内。
 * @returns {{scope: string, error?: string}}
 */
export function assertLaneWritable(lane, isAdmin, targetScope) {
    const scope = targetScope ?? lane;
    if (scope !== lane && !isAdmin) {
        return { scope, error: `lane isolation: cannot write scope "${scope}" from lane "${lane}" (read is allowed via memory_wm_get/memory_wm_list)` };
    }
    return { scope };
}

/** 缺省 taskId 解析：车道内最新活动任务 */
async function resolveTaskId(store, scope, taskId) {
    if (taskId) return { taskId };
    const active = await store.getActive(scope);
    if (!active) {
        return { taskId: null, active: null };
    }
    return { taskId: active.task_id, active };
}

/** 归档缺省解析：最新非归档任务（ARCHIVE-RULES：归档发生于 completed/abandoned 之后，不限于活动态） */
async function resolveArchivableTaskId(store, scope, taskId) {
    if (taskId) return { taskId };
    const res = await store.list({ scope, limit: 1 }); // 默认排除 archived，按 updated_at 降序
    if (!res.tasks || res.tasks.length === 0) return { taskId: null };
    return { taskId: res.tasks[0].task_id };
}

const NO_ACTIVE_HINT = 'no active task in this lane; pass taskId explicitly or create one with memory_wm_create';

// ============================================================================
// YAML 输出（保持文件层人工可读传统，仅支持本域数据类型）
// ============================================================================
function yamlScalar(value) {
    if (value === null || value === undefined) return '""';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const s = String(value);
    if (s === '') return '""';
    if (/[:#\n"'\[\]{}]|^\s|\s$/.test(s)) return JSON.stringify(s);
    return s;
}

function toYaml(value, indent = '') {
    if (Array.isArray(value)) {
        if (value.length === 0) return ' []';
        return '\n' + value.map((item) => {
            if (item !== null && typeof item === 'object') {
                const entries = Object.entries(item);
                const first = entries[0];
                const rest = entries.slice(1);
                let out = `${indent}- ${first ? `${first[0]}: ${yamlScalar(first[1])}` : ''}`;
                for (const [k, v] of rest) {
                    out += `\n${indent}  ${k}: ${yamlScalar(v)}`;
                }
                return out;
            }
            return `${indent}- ${yamlScalar(item)}`;
        }).join('\n');
    }
    if (value !== null && typeof value === 'object') {
        return '\n' + Object.entries(value)
            .map(([k, v]) => `${indent}${k}:${toYaml(v, indent + '  ')}`)
            .join('\n');
    }
    return ` ${yamlScalar(value)}`;
}

export function recordToYaml(record) {
    return Object.entries(record)
        .map(([k, v]) => `${k}:${toYaml(v, '  ')}`)
        .join('\n');
}

// ============================================================================
// 工具工厂
// ============================================================================
function textResult(result) {
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }], details: result };
}

function createWmGetTool(binding) {
    return {
        name: 'memory_wm_get',
        description: '（工作任务）Get the current working-memory task for your lane (or a specific task / another lane read-only). Working memory tracks active complex-task execution state.',
        parameters: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID (wm-YYYY-MM-DD-topic). Omit for the latest active task in the lane.' },
                scope: { type: 'string', description: 'Lane scope to read (default: your own lane). Cross-lane read is allowed.' },
                format: { type: 'string', enum: ['json', 'yaml'], description: 'Output format (default: json; yaml matches the legacy file-layer readability)' },
            },
        },
        execute: async (params) => {
            const store = getWorkingMemoryStore();
            const scope = params.scope ?? binding.lane;
            let record;
            if (params.taskId) {
                record = await store.getByTaskId(scope, params.taskId);
            }
            else {
                record = await store.getActive(scope);
            }
            if (!record) {
                return textResult({ success: true, empty: true, scope, message: NO_ACTIVE_HINT });
            }
            if (params.format === 'yaml') {
                return { content: [{ type: 'text', text: recordToYaml(record) }], details: { success: true, record } };
            }
            return textResult({ success: true, record });
        },
    };
}

function createWmCreateTool(binding) {
    return {
        name: 'memory_wm_create',
        description: '（工作任务）Create a working-memory task in your lane. One active complex task per lane is the convention.',
        parameters: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID, format wm-YYYY-MM-DD-topic (lowercase kebab-case)' },
                goal: { type: 'string', description: 'Task goal' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority (default: medium)' },
                status: { type: 'string', enum: ['planned', 'in_progress'], description: 'Initial status (default: planned)' },
                source: { type: 'string', description: 'Task source (e.g. user-request, cron, agent-delegation)' },
                owner: { type: 'string', description: 'Display owner (default: your lane)' },
                plan: { type: 'array', description: 'Plan steps: [{step, action, status, notes}]', items: { type: 'object' } },
                notes: { type: 'string', description: 'Free-form notes' },
                scope: { type: 'string', description: 'Target lane scope (admin/allowlist only; default: your own lane)' },
            },
            required: ['taskId', 'goal'],
        },
        execute: async (params) => {
            const { scope, error } = assertLaneWritable(binding.lane, binding.isAdmin, params.scope);
            if (error) return textResult({ success: false, error });
            const store = getWorkingMemoryStore();
            const result = await store.create({
                task_id: params.taskId,
                scope,
                goal: params.goal,
                priority: params.priority ?? 'medium',
                status: params.status ?? 'planned',
                owner: params.owner ?? binding.lane,
                source: params.source ?? '',
                plan: params.plan,
                notes: params.notes,
            });
            return textResult(result);
        },
    };
}

function createWmUpdateTool(binding) {
    return {
        name: 'memory_wm_update',
        description: '（工作任务）Patch fields of a working-memory task (goal/status/priority/currentStep/outcome/notes, or replace array fields). status=completed/abandoned auto-writes completed_at.',
        parameters: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID (default: latest active task in the lane)' },
                scope: { type: 'string', description: 'Target lane (admin/allowlist only for writes; default: your lane)' },
                goal: { type: 'string' },
                status: { type: 'string', enum: ['planned', 'in_progress', 'blocked', 'completed', 'abandoned'] },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                currentStep: { type: 'number' },
                outcome: { type: 'string', enum: ['success', 'partial', 'failure', 'cancelled', ''] },
                notes: { type: 'string' },
                plan: { type: 'array', items: { type: 'object' }, description: 'Replace entire plan array' },
                decisions: { type: 'array', items: { type: 'string' }, description: 'Replace entire array (prefer memory_wm_append for additions)' },
                learnings: { type: 'array', items: { type: 'string' } },
                risks: { type: 'array', items: { type: 'string' } },
                blockers: { type: 'array', items: { type: 'string' } },
                artifacts: { type: 'array', items: { type: 'string' } },
                nextActions: { type: 'array', items: { type: 'string' } },
            },
        },
        execute: async (params) => {
            const { scope, error } = assertLaneWritable(binding.lane, binding.isAdmin, params.scope);
            if (error) return textResult({ success: false, error });
            const store = getWorkingMemoryStore();
            const { taskId } = await resolveTaskId(store, scope, params.taskId);
            if (!taskId) return textResult({ success: false, error: NO_ACTIVE_HINT, scope });
            const patch = {};
            const scalarMap = { goal: 'goal', status: 'status', priority: 'priority', currentStep: 'current_step', outcome: 'outcome', notes: 'notes' };
            for (const [param, field] of Object.entries(scalarMap)) {
                if (params[param] !== undefined) patch[field] = params[param];
            }
            const arrayMap = { plan: 'plan', decisions: 'decisions', learnings: 'learnings', risks: 'risks', blockers: 'blockers', artifacts: 'artifacts', nextActions: 'next_actions' };
            for (const [param, field] of Object.entries(arrayMap)) {
                if (params[param] !== undefined) patch[field] = params[param];
            }
            if (Object.keys(patch).length === 0) {
                return textResult({ success: false, error: 'no patch fields provided' });
            }
            const result = await store.update(scope, taskId, patch);
            return textResult(result);
        },
    };
}

function createWmAppendTool(binding) {
    return {
        name: 'memory_wm_append',
        description: '（工作任务）Append items to working-memory task array fields (decisions/learnings/risks/blockers/artifacts/nextActions/plan) without replacing existing content.',
        parameters: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID (default: latest active task in the lane)' },
                scope: { type: 'string', description: 'Target lane (admin/allowlist only for writes; default: your lane)' },
                decisions: { type: 'array', items: { type: 'string' } },
                learnings: { type: 'array', items: { type: 'string' } },
                risks: { type: 'array', items: { type: 'string' } },
                blockers: { type: 'array', items: { type: 'string' } },
                artifacts: { type: 'array', items: { type: 'string' } },
                nextActions: { type: 'array', items: { type: 'string' } },
                plan: { type: 'array', items: { type: 'object' }, description: 'Append plan steps' },
                notes: { type: 'string', description: 'Replace notes (scalar, applied alongside append)' },
            },
        },
        execute: async (params) => {
            const { scope, error } = assertLaneWritable(binding.lane, binding.isAdmin, params.scope);
            if (error) return textResult({ success: false, error });
            const store = getWorkingMemoryStore();
            const { taskId } = await resolveTaskId(store, scope, params.taskId);
            if (!taskId) return textResult({ success: false, error: NO_ACTIVE_HINT, scope });
            const additions = {};
            const arrayMap = { decisions: 'decisions', learnings: 'learnings', risks: 'risks', blockers: 'blockers', artifacts: 'artifacts', nextActions: 'next_actions', plan: 'plan' };
            for (const [param, field] of Object.entries(arrayMap)) {
                if (params[param] !== undefined) additions[field] = params[param];
            }
            if (params.notes !== undefined) additions.notes = params.notes;
            const result = await store.append(scope, taskId, additions);
            return textResult(result);
        },
    };
}

function createWmListTool(binding) {
    return {
        name: 'memory_wm_list',
        description: '（工作任务）List working-memory tasks. Default: non-archived tasks in your lane. Use scope to view other lanes (read-only), status=archived for history, scopes=true for a cross-lane overview.',
        parameters: {
            type: 'object',
            properties: {
                scope: { type: 'string', description: 'Lane scope filter (default: your lane)' },
                status: { type: 'string', enum: ['planned', 'in_progress', 'blocked', 'completed', 'abandoned', 'archived'], description: 'Status filter (default: all non-archived)' },
                limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default: 20)' },
                offset: { type: 'number', minimum: 0, description: 'Pagination offset' },
                scopes: { type: 'boolean', description: 'true = cross-lane overview (per-lane active/archived counts + latest active task)' },
            },
        },
        execute: async (params) => {
            const store = getWorkingMemoryStore();
            if (params.scopes === true) {
                const overview = await store.laneOverview();
                return textResult({ ...overview, yourLane: binding.lane });
            }
            const scope = params.scope ?? binding.lane;
            const result = await store.list({
                scope,
                status: params.status,
                limit: params.limit,
                offset: params.offset,
                excludeArchived: params.status === 'archived' ? true : undefined,
            });
            return textResult({ ...result, scope });
        },
    };
}

function createWmArchiveTool(binding) {
    return {
        name: 'memory_wm_archive',
        description: '（工作任务）Archive a working-memory task (status=archived, keeps queryable snapshot). Validates ARCHIVE-RULES required fields (goal/outcome/decisions/learnings/artifacts) and reports missing ones.',
        parameters: {
            type: 'object',
            properties: {
                taskId: { type: 'string', description: 'Task ID (default: latest active task in the lane)' },
                scope: { type: 'string', description: 'Target lane (admin/allowlist only for writes; default: your lane)' },
                outcome: { type: 'string', enum: ['success', 'partial', 'failure', 'cancelled'], description: 'Final outcome (applied before validation)' },
                status: { type: 'string', enum: ['completed', 'abandoned'], description: 'Pre-archive status (default: completed)' },
                notes: { type: 'string', description: 'Closing notes (applied before validation)' },
            },
        },
        execute: async (params) => {
            const { scope, error } = assertLaneWritable(binding.lane, binding.isAdmin, params.scope);
            if (error) return textResult({ success: false, error });
            const store = getWorkingMemoryStore();
            const { taskId } = await resolveArchivableTaskId(store, scope, params.taskId);
            if (!taskId) return textResult({ success: false, error: NO_ACTIVE_HINT, scope });
            const result = await store.archive(scope, taskId, {
                outcome: params.outcome,
                notes: params.notes,
                status: params.status ?? 'completed',
            });
            return textResult(result);
        },
    };
}

// ============================================================================
// 注册入口（由 register.js 调用）
// ============================================================================
const TOOL_FACTORIES = [
    ['memory_wm_get', createWmGetTool],
    ['memory_wm_create', createWmCreateTool],
    ['memory_wm_update', createWmUpdateTool],
    ['memory_wm_append', createWmAppendTool],
    ['memory_wm_list', createWmListTool],
    ['memory_wm_archive', createWmArchiveTool],
];

/**
 * Register memory_wm_* tools with per-agent factory binding.
 *
 * @param {function} registerTool - api.registerTool（宿主支持工厂函数）
 * @param {object} deps
 * @param {function} deps.getConfig - 返回当前插件配置（lazy，注册时 config 可能未就绪）
 * @param {function} deps.adapt - adaptToolForHost 包装器
 */
export function registerWmTools(registerTool, deps) {
    for (const [toolName, createTool] of TOOL_FACTORIES) {
        registerTool((ctx) => {
            const config = deps.getConfig();
            if (config?.workingMemory?.enabled === false) {
                return null; // 灰度开关：宿主跳过 null 工厂结果
            }
            const binding = {
                lane: resolveLane(ctx, config),
                isAdmin: isAdminLane(ctx, config),
            };
            return deps.adapt(createTool(binding));
        }, { name: toolName });
    }
}
