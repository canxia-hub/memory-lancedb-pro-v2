/**
 * memory-lancedb-pro-v2 Plugin Entry
 *
 * Phase 3+4 wiring - minimal capability registration and interop helpers.
 * Maintains Phase 0 skeleton structure while adding capability/runtime support.
 * Batch B: Added wiki supplement registration.
 *
 * Tools registered via registerAllMemoryTools.
 */
import { MemoryCapabilityRuntime } from './interop/memory-capability.js';
import { HostEventsManager } from './interop/host-events.js';
import { WikiCorpusSupplement, MemoryPromptSectionBuilder } from './wiki/wiki-supplement.js';
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
declare function register(api: {
    pluginConfig: unknown;
    config?: {
        agents?: {
            defaults?: {
                workspace?: string;
            };
            list?: Array<{
                id?: string;
                workspace?: string;
                default?: boolean;
            }>;
        };
    };
    logger: {
        info: (message: string) => void;
        warn?: (message: string) => void;
        error?: (message: string) => void;
    };
    registerTool: (tool: unknown, opts?: {
        optional?: boolean;
    }) => void;
    registerMemoryCapability?: (params: {
        runtime: unknown;
        publicArtifacts: unknown;
    }) => void;
    registerMemoryPromptSupplement?: (builder: MemoryPromptSectionBuilder) => void;
    registerMemoryCorpusSupplement?: (supplement: WikiCorpusSupplement) => void;
    registerCli?: (handler: (ctx: {
        program: unknown;
    }) => void, opts?: {
        descriptors?: Array<{
            name: string;
            description: string;
            hasSubcommands?: boolean;
        }>;
    }) => void;
}): void;
/**
 * Get memory capability runtime (for external access).
 *
 * @returns Memory capability runtime or null if not initialized
 */
declare function getCapability(): MemoryCapabilityRuntime | null;
/**
 * Get events manager (for external access).
 *
 * @returns Host events manager or null if not initialized
 */
declare function getEvents(): HostEventsManager | null;
/**
 * OpenClaw plugin export
 */
declare const _default: {
    id: string;
    name: string;
    description: string;
    kind: string;
    register: typeof register;
};
export default _default;
/**
 * Export config types for external consumers (optional)
 */
export { MemoryPluginConfig, RetrievalConfig, HostInteropConfig, DEFAULT_CONFIG } from './config/schema.js';
export { resolveConfig, MemoryPluginConfigInput } from './config/resolve-config.js';
export { MemoryBackendConfig, resolveMemoryBackendConfig } from './config/resolve-backend-config.js';
export { MemorySearchResult } from './types/memory-search-result.js';
export { AssetModality, SourceType, MemoryAssetInput, MemoryAssetRecord, AssetStoreStatus, AssetQueryOptions, AssetCreateResult, AssetBatchCreateResult, AssetListResult, } from './types/memory-asset.js';
export { AssetStore, AssetStoreConfig, resolveAssetStoreConfig, createAssetStore, initializeAssetStore, getAssetStore, closeAssetStore, } from './store/asset-store.js';
export { CURRENT_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, MIGRATION_CAPABILITIES, createMigrationManager, createLegacyMigrationManager, createLegacyMigrator, } from './store/migrations.js';
export { LegacyMigrator, MigrationMode, MigrationOptions, MigrationReport, findLegacyDatabase, readLegacyEntries, mapLegacyToV2, migrateFromLegacy, } from './migration/index.js';
export { MemoryCapabilityRuntime, MemoryCapabilityStatus, SearchManager, SearchManagerStatus, SearchOptions, EmbeddingAvailability, createMemoryCapabilityRuntime, getMemoryCapabilityRuntime, getMemorySearchManager, resolveBackendConfigForCapability, createAndInitializeMemoryCapability, } from './interop/memory-capability.js';
export { PublicArtifactsList, PublicArtifact, PublicArtifactType, PublicArtifactsOptions, PublicArtifactsProvider, ARTIFACT_PATHS, listPublicArtifacts, hasStandardArtifacts, getArtifactContent, createPublicArtifactsProvider, } from './interop/public-artifacts.js';
export { HostEventsManager, HostEvent, AllowedEventType, ReadEventsOptions, HostEventsOptions, ALLOWED_EVENT_TYPES, isValidEventType, createHostEventsManager, createRecallRecordedEvent, createPromotionAppliedEvent, } from './interop/host-events.js';
export { getCapability, getEvents };
export * from './wiki/index.js';
//# sourceMappingURL=index.d.ts.map