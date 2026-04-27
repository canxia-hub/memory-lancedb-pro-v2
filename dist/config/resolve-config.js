/**
 * Resolve Full Plugin Configuration
 *
 * Handles complete plugin configuration parsing with defaults.
 * Phase 0 minimal implementation - only essential config fields.
 */
import { DEFAULT_CONFIG, DEFAULT_WIKI_VAULT_PATH, } from './schema.js';
/**
 * Resolve full plugin configuration with defaults.
 *
 * @param input - Raw input configuration (may be partial)
 * @returns Complete plugin configuration with defaults applied
 * @throws Error if required dbPath is missing
 */
export function resolveConfig(input) {
    // Validate required field
    if (!input.dbPath) {
        throw new Error('Memory plugin config missing required field: dbPath');
    }
    // Resolve retrieval config with defaults
    const retrieval = {
        hybrid: input.retrieval?.hybrid ?? DEFAULT_CONFIG.retrieval.hybrid,
        rerank: input.retrieval?.rerank ?? DEFAULT_CONFIG.retrieval.rerank,
    };
    // Resolve host interop config with defaults
    const hostInterop = {
        enableArtifacts: input.hostInterop?.enableArtifacts ?? DEFAULT_CONFIG.hostInterop.enableArtifacts,
        enableEvents: input.hostInterop?.enableEvents ?? DEFAULT_CONFIG.hostInterop.enableEvents,
    };
    // Batch B: Resolve wiki vault config with defaults
    const vault = {
        path: input.vault?.path ?? DEFAULT_CONFIG.vault.path ?? DEFAULT_WIKI_VAULT_PATH,
    };
    // Batch B: Resolve wiki context config with defaults
    const context = {
        includeCompiledDigestPrompt: input.context?.includeCompiledDigestPrompt ?? DEFAULT_CONFIG.context.includeCompiledDigestPrompt,
    };
    // Batch B: Resolve obsidian config with defaults
    const obsidian = {
        enabled: input.obsidian?.enabled ?? DEFAULT_CONFIG.obsidian.enabled,
    };
    // Build full config with defaults
    const config = {
        dbPath: input.dbPath,
        connectionMode: input.connectionMode ?? DEFAULT_CONFIG.connectionMode,
        tableName: input.tableName ?? DEFAULT_CONFIG.tableName,
        embeddingDimension: input.embeddingDimension ?? DEFAULT_CONFIG.embeddingDimension,
        defaultScope: input.defaultScope ?? DEFAULT_CONFIG.defaultScope,
        retrieval,
        hostInterop,
        // Phase C: Assets table and path defaults
        assetsTableName: input.assetsTableName ?? 'memory_assets',
        assetsPath: input.assetsPath ?? `${input.dbPath}/assets`,
        // Batch B: Wiki config
        vault,
        context,
        obsidian,
    };
    return config;
}
//# sourceMappingURL=resolve-config.js.map