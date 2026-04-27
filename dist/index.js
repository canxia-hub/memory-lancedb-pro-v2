/**
 * memory-lancedb-pro-v2 Plugin Entry
 *
 * Phase 3+4 wiring - minimal capability registration and interop helpers.
 * Maintains Phase 0 skeleton structure while adding capability/runtime support.
 * Batch B: Added wiki supplement registration.
 *
 * Tools registered via registerAllMemoryTools.
 */
import { resolveConfig } from './config/resolve-config.js';
import { resolveMemoryBackendConfig } from './config/resolve-backend-config.js';
// Tool registration
import { registerAllMemoryTools, initializeToolContext, } from './tools/register.js';
// Phase 3+4 interop imports
import { createMemoryCapabilityRuntime, } from './interop/memory-capability.js';
// Import public artifacts provider factory for register() use
import { createPublicArtifactsProvider, } from './interop/public-artifacts.js';
import { createHostEventsManager, } from './interop/host-events.js';
// Batch B: Wiki supplement imports
import { createWikiCorpusSupplement, createWikiPromptSectionBuilder, } from './wiki/wiki-supplement.js';
// Phase G: Wiki CLI registration
import { registerWikiCli } from './wiki/wiki-command.js';
/**
 * Plugin metadata
 */
const id = 'memory-lancedb-pro-v2';
const name = 'memory-lancedb-pro-v2';
const description = 'Capability-first LanceDB memory plugin with wiki graph tools and host interop';
const kind = 'memory';
/**
 * Internal state for capability runtime.
 * Initialized during register() call.
 */
let _capabilityRuntime = null;
let _eventsManager = null;
/**
 * OpenClaw plugin registration.
 * Called by OpenClaw when loading the plugin.
 *
 * Phase 3+4 wiring:
 * - Parses configuration (Phase 0 skeleton preserved)
 * - Creates capability runtime
 * - Initializes interop helpers (artifacts/events)
 * - Registers memory tools
 * - Batch B: Registers wiki corpus/prompt supplements
 *
 * Seam contract fix (Phase 3+4):
 * - registerMemoryCapability({ runtime, publicArtifacts })
 * - runtime includes getMemorySearchManager() AND resolveMemoryBackendConfig()
 * - publicArtifacts is a provider with listArtifacts() method
 *
 * Batch B seam contract:
 * - registerMemoryPromptSupplement(builder)
 * - registerMemoryCorpusSupplement(supplement)
 */
function register(api) {
    // Parse and validate configuration from plugin manifest (Phase 0 preserved)
    const rawConfig = api.pluginConfig;
    const config = resolveConfig(rawConfig);
    const backendConfig = resolveMemoryBackendConfig(config);
    // Phase 0 skeleton: log successful config resolution (preserved)
    api.logger.info('[memory-lancedb-pro-v2] capability-ready (Phase 3+4)');
    api.logger.info(`  dbPath: ${backendConfig.dbPath}`);
    api.logger.info(`  connectionMode: ${backendConfig.connectionMode}`);
    api.logger.info(`  tableName: ${backendConfig.tableName}`);
    api.logger.info(`  embeddingDimension: ${backendConfig.embeddingDimension}`);
    api.logger.info(`  retrieval.hybrid: ${config.retrieval.hybrid}`);
    api.logger.info(`  retrieval.rerank: ${config.retrieval.rerank}`);
    api.logger.info(`  hostInterop.enableArtifacts: ${config.hostInterop.enableArtifacts}`);
    api.logger.info(`  hostInterop.enableEvents: ${config.hostInterop.enableEvents}`);
    // Batch B: Wiki config logging
    api.logger.info(`  vault.path: ${config.vault?.path ?? 'default'}`);
    api.logger.info(`  context.includeCompiledDigestPrompt: ${config.context?.includeCompiledDigestPrompt ?? false}`);
    api.logger.info(`  obsidian.enabled: ${config.obsidian?.enabled ?? false}`);
    // CRITICAL FIX: register tools synchronously during plugin load.
    // Tool handlers lazily ensure the shared store/search context is ready on first use,
    // so slow DB initialization cannot make the plugin appear unloaded.
    registerAllMemoryTools(api.registerTool, {
        enableManagementTools: true,
        enableAliases: true,
    });
    api.logger.info('[memory-lancedb-pro-v2] memory tools registered');
    // Warm the tool context in background for faster first use.
    void initializeToolContext({ config, backendConfig })
        .then(() => {
        api.logger.info('[memory-lancedb-pro-v2] tool context initialized');
    })
        .catch((error) => {
        api.logger.error?.(`[memory-lancedb-pro-v2] failed to initialize tool context: ${error}`);
    });
    const primaryWorkspaceRoot = api.config?.agents?.defaults?.workspace ?? process.cwd();
    api.logger.info(`[memory-lancedb-pro-v2] workspace root resolved: ${primaryWorkspaceRoot}`);
    // Batch B: Register wiki supplements (prompt + corpus)
    // Honest degradation: if host API doesn't support, log and continue
    try {
        // Register prompt supplement
        if (api.registerMemoryPromptSupplement) {
            const promptBuilder = createWikiPromptSectionBuilder(config);
            api.registerMemoryPromptSupplement(promptBuilder);
            api.logger.info('[memory-lancedb-pro-v2] wiki prompt supplement registered');
            api.logger.info(`  - includeCompiledDigestPrompt: ${config.context?.includeCompiledDigestPrompt ?? false}`);
        }
        else {
            api.logger.warn?.('[memory-lancedb-pro-v2] host API does not support registerMemoryPromptSupplement');
        }
        // Register corpus supplement
        if (api.registerMemoryCorpusSupplement) {
            const corpusSupplement = createWikiCorpusSupplement({ config, appConfig: api.config });
            api.registerMemoryCorpusSupplement(corpusSupplement);
            api.logger.info('[memory-lancedb-pro-v2] wiki corpus supplement registered');
            api.logger.info(`  - vault.path: ${config.vault?.path ?? 'default'}`);
        }
        else {
            api.logger.warn?.('[memory-lancedb-pro-v2] host API does not support registerMemoryCorpusSupplement');
        }
    }
    catch (error) {
        api.logger.error?.(`[memory-lancedb-pro-v2] failed to register wiki supplements: ${error}`);
        // Honest degradation: continue without wiki supplements
    }
    // Phase G: Register wiki CLI (if host API supports)
    if (api.registerCli) {
        try {
            api.registerCli(({ program }) => {
                registerWikiCli(program, config, api.config);
            }, {
                descriptors: [
                    {
                        name: 'wiki',
                        description: 'Inspect and initialize the memory wiki vault',
                        hasSubcommands: true,
                    },
                ],
            });
            api.logger.info('[memory-lancedb-pro-v2] wiki CLI registered');
        }
        catch (error) {
            api.logger.error?.(`[memory-lancedb-pro-v2] failed to register wiki CLI: ${error}`);
            // Honest degradation: continue without CLI
        }
    }
    else {
        api.logger.warn?.('[memory-lancedb-pro-v2] host API does not support registerCli');
    }
    // Phase 3+4: Create capability runtime
    try {
        _capabilityRuntime = createMemoryCapabilityRuntime({ config });
        api.logger.info('[memory-lancedb-pro-v2] capability runtime created');
        // Register memory capability if host API supports it
        // Seam contract: { runtime, publicArtifacts }
        if (api.registerMemoryCapability) {
            const publicArtifactsProvider = createPublicArtifactsProvider(primaryWorkspaceRoot);
            api.registerMemoryCapability({
                runtime: _capabilityRuntime,
                publicArtifacts: publicArtifactsProvider,
            });
            api.logger.info('[memory-lancedb-pro-v2] memory capability registered with host');
            api.logger.info('  - runtime: includes getMemorySearchManager() + resolveMemoryBackendConfig()');
            api.logger.info('  - publicArtifacts: provider with listArtifacts() method');
        }
        else {
            api.logger.warn?.('[memory-lancedb-pro-v2] host API does not support registerMemoryCapability');
        }
    }
    catch (error) {
        api.logger.error?.(`[memory-lancedb-pro-v2] failed to create capability runtime: ${error}`);
        // Honest degradation: continue without capability if creation fails
        _capabilityRuntime = null;
    }
    // Phase 3+4: Create host events manager (if enabled)
    if (config.hostInterop.enableEvents) {
        try {
            const eventsDir = `${primaryWorkspaceRoot}/memory/events`;
            _eventsManager = createHostEventsManager({ eventsDir });
            api.logger.info('[memory-lancedb-pro-v2] host events manager created');
        }
        catch (error) {
            api.logger.error?.(`[memory-lancedb-pro-v2] failed to create events manager: ${error}`);
            _eventsManager = null;
        }
    }
    // Honest status: report what was actually initialized
    const status = {
        capability: _capabilityRuntime !== null,
        events: _eventsManager !== null,
        vaultRoot: primaryWorkspaceRoot,
    };
    api.logger.info(`[memory-lancedb-pro-v2] interop status: ${JSON.stringify(status)}`);
}
/**
 * Get memory capability runtime (for external access).
 *
 * @returns Memory capability runtime or null if not initialized
 */
function getCapability() {
    return _capabilityRuntime;
}
/**
 * Get events manager (for external access).
 *
 * @returns Host events manager or null if not initialized
 */
function getEvents() {
    return _eventsManager;
}
/**
 * OpenClaw plugin export
 */
export default {
    id,
    name,
    description,
    kind,
    register,
};
/**
 * Export config types for external consumers (optional)
 */
export { DEFAULT_CONFIG } from './config/schema.js';
export { resolveConfig } from './config/resolve-config.js';
export { resolveMemoryBackendConfig } from './config/resolve-backend-config.js';
// Phase C: Asset store exports
export { resolveAssetStoreConfig, createAssetStore, initializeAssetStore, getAssetStore, closeAssetStore, } from './store/asset-store.js';
// Legacy migration exports
export { CURRENT_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, MIGRATION_CAPABILITIES, createMigrationManager, createLegacyMigrationManager, createLegacyMigrator, } from './store/migrations.js';
export { LegacyMigrator, findLegacyDatabase, readLegacyEntries, mapLegacyToV2, migrateFromLegacy, } from './migration/index.js';
//
// Phase 3+4 interop exports
//
// Memory capability exports
export { createMemoryCapabilityRuntime, getMemoryCapabilityRuntime, getMemorySearchManager, resolveBackendConfigForCapability, createAndInitializeMemoryCapability, } from './interop/memory-capability.js';
// Public artifacts exports
export { ARTIFACT_PATHS, listPublicArtifacts, hasStandardArtifacts, getArtifactContent, createPublicArtifactsProvider, } from './interop/public-artifacts.js';
// Host events exports
export { ALLOWED_EVENT_TYPES, isValidEventType, createHostEventsManager, createRecallRecordedEvent, createPromotionAppliedEvent, } from './interop/host-events.js';
//
// Convenience getters (runtime access)
//
export { getCapability, getEvents };
//
// Wiki exports (Phase W1-W4)
//
export * from './wiki/index.js';
//# sourceMappingURL=index.js.map