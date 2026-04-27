/**
 * Resolve Backend-Specific Configuration
 *
 * Handles LanceDB backend-specific configuration parsing.
 * Returns minimal backend config required for store operations.
 */
import { MemoryPluginConfig } from './schema.js';
/**
 * Backend-specific configuration for LanceDB operations.
 */
export interface MemoryBackendConfig {
    /** Database storage path (required, no default) */
    dbPath: string;
    /** Connection mode (required, has default) */
    connectionMode: 'embedded' | 'remote';
    /** Table name (optional, has default) */
    tableName: string;
    /** Embedding dimension (optional, has default) */
    embeddingDimension: number;
}
/**
 * Resolve backend configuration from plugin config.
 *
 * @param config - Full plugin configuration
 * @returns Backend-specific configuration with defaults applied
 * @throws Error if dbPath is missing or invalid
 */
export declare function resolveMemoryBackendConfig(config: MemoryPluginConfig): MemoryBackendConfig;
//# sourceMappingURL=resolve-backend-config.d.ts.map