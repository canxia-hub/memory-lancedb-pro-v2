/**
 * Public Artifacts Export
 *
 * Bridge contract for memory-wiki / host memory capability consumers.
 *
 * IMPORTANT:
 * - listArtifacts() must return an ARRAY, not a wrapped object
 * - each artifact must expose workspaceDir / agentIds / relativePath / absolutePath / kind / contentType
 * - bridge import is multi-workspace; when cfg is available, enumerate all agent workspaces
 */
import * as fs from 'fs';
import * as path from 'path';
/**
 * Standard artifact paths inside a workspace.
 */
const STANDARD_ARTIFACT_PATHS = {
    MEMORY_MD: 'MEMORY.md',
    DREAMS_MD: 'DREAMS.md',
    MEMORY_DIR: 'memory',
    DREAMING_DIR: 'memory/dreaming',
    EVENTS_LOG: 'memory/.dreams/events.jsonl',
};
function normalizeWorkspacePath(input) {
    return path.resolve(input);
}
function toRelativePosix(workspaceDir, absolutePath) {
    return path.relative(workspaceDir, absolutePath).replace(/\\/g, '/');
}
function safeStat(filePath) {
    try {
        return fs.statSync(filePath);
    }
    catch {
        return null;
    }
}
function pushArtifact(target, workspaceDir, agentIds, absolutePath, kind, contentType) {
    const stats = safeStat(absolutePath);
    if (!stats?.isFile()) {
        return;
    }
    target.push({
        workspaceDir,
        agentIds,
        relativePath: toRelativePosix(workspaceDir, absolutePath),
        absolutePath,
        kind,
        contentType,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
    });
}
function walkMarkdownFiles(dirPath, collector) {
    if (!fs.existsSync(dirPath)) {
        return;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.dreams') {
                continue;
            }
            walkMarkdownFiles(entryPath, collector);
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.md')) {
            collector.push(entryPath);
        }
    }
}
function resolveWorkspaceBindings(vaultRoot, cfg) {
    const fallbackWorkspace = normalizeWorkspacePath(vaultRoot);
    const bindings = new Map();
    const ensureBinding = (workspaceDir, agentId) => {
        const normalized = normalizeWorkspacePath(workspaceDir);
        const set = bindings.get(normalized) ?? new Set();
        if (agentId) {
            set.add(agentId);
        }
        bindings.set(normalized, set);
    };
    const appCfg = (cfg ?? {});
    const defaultWorkspace = typeof appCfg.agents?.defaults?.workspace === 'string'
        ? normalizeWorkspacePath(appCfg.agents.defaults.workspace)
        : fallbackWorkspace;
    let hasAnyAgent = false;
    for (const entry of appCfg.agents?.list ?? []) {
        const agentId = typeof entry?.id === 'string' && entry.id.trim() !== ''
            ? entry.id.trim()
            : (entry?.default ? 'main' : 'unknown');
        const workspaceDir = typeof entry?.workspace === 'string' && entry.workspace.trim() !== ''
            ? entry.workspace.trim()
            : defaultWorkspace;
        ensureBinding(workspaceDir, agentId);
        hasAnyAgent = true;
    }
    if (!hasAnyAgent) {
        ensureBinding(defaultWorkspace, 'main');
    }
    return [...bindings.entries()]
        .map(([workspaceDir, agentIds]) => ({
        workspaceDir,
        agentIds: [...agentIds].sort(),
    }))
        .sort((left, right) => left.workspaceDir.localeCompare(right.workspaceDir));
}
function discoverWorkspaceArtifacts(binding) {
    const { workspaceDir, agentIds } = binding;
    const artifacts = [];
    // memory roots
    pushArtifact(artifacts, workspaceDir, agentIds, path.join(workspaceDir, STANDARD_ARTIFACT_PATHS.MEMORY_MD), 'memory-root', 'text/markdown');
    pushArtifact(artifacts, workspaceDir, agentIds, path.join(workspaceDir, STANDARD_ARTIFACT_PATHS.DREAMS_MD), 'memory-root', 'text/markdown');
    // event log
    pushArtifact(artifacts, workspaceDir, agentIds, path.join(workspaceDir, STANDARD_ARTIFACT_PATHS.EVENTS_LOG), 'event-log', 'application/x-ndjson');
    // markdown files under memory/
    const markdownFiles = [];
    walkMarkdownFiles(path.join(workspaceDir, STANDARD_ARTIFACT_PATHS.MEMORY_DIR), markdownFiles);
    for (const markdownPath of markdownFiles) {
        const relativePath = toRelativePosix(workspaceDir, markdownPath);
        const isDreamReport = relativePath.startsWith(`${STANDARD_ARTIFACT_PATHS.DREAMING_DIR}/`);
        pushArtifact(artifacts, workspaceDir, agentIds, markdownPath, isDreamReport ? 'dream-report' : 'daily-note', 'text/markdown');
    }
    return artifacts;
}
/**
 * Error thrown when publicArtifacts.listArtifacts() is called but the vault
 * is not properly configured. This prevents upstream sync from misinterpreting
 * an empty result as "should delete all imported sources".
 *
 * IMPORTANT: This is a protective measure against destructive sync bugs.
 */
export class VaultNotReadyError extends Error {
    vaultRoot;
    reason;
    constructor(vaultRoot, reason, message) {
        super(message);
        this.vaultRoot = vaultRoot;
        this.reason = reason;
        this.name = 'VaultNotReadyError';
    }
}
/**
 * Create provider bound to a fallback workspace root.
 *
 * PROTECTION (Scheme A): listArtifacts() validates vault readiness before
 * returning results. If vault is not accessible or lacks standard artifacts,
 * it throws VaultNotReadyError instead of returning empty array.
 *
 * This prevents upstream syncMemoryWikiBridgeSources from executing
 * destructive prune when artifacts count appears to be 0.
 */
export function createPublicArtifactsProvider(vaultRoot) {
    // Pre-validate vault root at provider creation time
    const normalizedVaultRoot = normalizeWorkspacePath(vaultRoot);
    const vaultExists = fs.existsSync(normalizedVaultRoot);
    return {
        async listArtifacts(options) {
            // PROTECTION: Validate vault before enumeration
            if (!fs.existsSync(normalizedVaultRoot)) {
                throw new VaultNotReadyError(normalizedVaultRoot, 'vault-not-found', `Vault root does not exist: ${normalizedVaultRoot}. ` +
                    `This indicates plugin was loaded in a process without proper workspace config. ` +
                    `Sync should NOT proceed with 0 artifacts.`);
            }
            // Enumerate artifacts
            const artifacts = listPublicArtifacts({
                vaultRoot,
                cfg: options?.cfg,
            });
            // PROTECTION: If no artifacts found but vault exists, check for standard artifacts
            // A properly configured vault should have at least MEMORY.md or DREAMS.md
            if (artifacts.length === 0) {
                const memoryMdPath = path.join(normalizedVaultRoot, STANDARD_ARTIFACT_PATHS.MEMORY_MD);
                const dreamsMdPath = path.join(normalizedVaultRoot, STANDARD_ARTIFACT_PATHS.DREAMS_MD);
                const hasMemoryMd = fs.existsSync(memoryMdPath);
                const hasDreamsMd = fs.existsSync(dreamsMdPath);
                // If vault exists but has NO standard artifacts, this is likely a config mismatch
                // (e.g., vaultRoot points to wrong directory like process.cwd() in Gateway process)
                if (!hasMemoryMd && !hasDreamsMd) {
                    throw new VaultNotReadyError(normalizedVaultRoot, 'no-standard-artifacts', `Vault exists but has no standard artifacts (MEMORY.md / DREAMS.md). ` +
                        `vaultRoot=${normalizedVaultRoot}. ` +
                        `This likely indicates workspace config mismatch. ` +
                        `Sync should NOT proceed with 0 artifacts to avoid destructive prune.`);
                }
            }
            return artifacts;
        },
        hasStandardArtifacts() {
            return hasStandardArtifacts(vaultRoot);
        },
        getArtifactContent(relativePath) {
            return getArtifactContent(vaultRoot, relativePath);
        },
    };
}
/**
 * Enumerate bridge artifacts across configured workspaces.
 */
export function listPublicArtifacts(options) {
    const bindings = resolveWorkspaceBindings(options.vaultRoot, options.cfg);
    const artifacts = bindings.flatMap(discoverWorkspaceArtifacts);
    return artifacts.sort((left, right) => {
        const workspaceOrder = left.workspaceDir.localeCompare(right.workspaceDir);
        if (workspaceOrder !== 0)
            return workspaceOrder;
        const relativeOrder = left.relativePath.localeCompare(right.relativePath);
        if (relativeOrder !== 0)
            return relativeOrder;
        const kindOrder = left.kind.localeCompare(right.kind);
        if (kindOrder !== 0)
            return kindOrder;
        return left.absolutePath.localeCompare(right.absolutePath);
    });
}
/**
 * Quick probe for fallback workspace standard artifacts.
 */
export function hasStandardArtifacts(vaultRoot) {
    const normalized = normalizeWorkspacePath(vaultRoot);
    const memoryMdPath = path.join(normalized, STANDARD_ARTIFACT_PATHS.MEMORY_MD);
    const dreamsMdPath = path.join(normalized, STANDARD_ARTIFACT_PATHS.DREAMS_MD);
    return fs.existsSync(memoryMdPath) || fs.existsSync(dreamsMdPath);
}
/**
 * Read artifact content from fallback workspace.
 */
export function getArtifactContent(vaultRoot, relativePath) {
    const absolutePath = path.join(normalizeWorkspacePath(vaultRoot), relativePath);
    if (!fs.existsSync(absolutePath)) {
        return null;
    }
    try {
        return fs.readFileSync(absolutePath, 'utf-8');
    }
    catch {
        return null;
    }
}
/**
 * Standard artifact paths for reference.
 */
export const ARTIFACT_PATHS = STANDARD_ARTIFACT_PATHS;
//# sourceMappingURL=public-artifacts.js.map