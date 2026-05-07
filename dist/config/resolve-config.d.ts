/**
 * Resolve Full Plugin Configuration
 *
 * Handles complete plugin configuration parsing with defaults.
 * Phase 0 minimal implementation - only essential config fields.
 */
import { MemoryPluginConfig, RetrievalConfig, HostInteropConfig, WikiVaultConfig, WikiContextConfig, ObsidianConfig } from './schema.js';
/**
 * Input configuration from plugin manifest or runtime.
 * All fields optional; defaults will be applied.
 */
export interface MemoryPluginConfigInput {
    dbPath?: string;
    connectionMode?: 'embedded' | 'remote';
    tableName?: string;
    embeddingDimension?: number;
    defaultScope?: string;
    retrieval?: Partial<RetrievalConfig>;
    hostInterop?: Partial<HostInteropConfig>;
    assetsTableName?: string;
    assetsPath?: string;
    vault?: Partial<WikiVaultConfig>;
    context?: Partial<WikiContextConfig>;
    obsidian?: Partial<ObsidianConfig>;
}
/**
 * Resolve full plugin configuration with defaults.
 *
 * @param input - Raw input configuration (may be partial)
 * @returns Complete plugin configuration with defaults applied
 * @throws Error if required dbPath is missing
 */
export declare function resolveConfig(input: MemoryPluginConfigInput): MemoryPluginConfig;
//# sourceMappingURL=resolve-config.d.ts.map