/**
 * Resolve Backend-Specific Configuration
 *
 * Handles LanceDB backend-specific configuration parsing.
 * Returns minimal backend config required for store operations.
 */
/**
 * Resolve backend configuration from plugin config.
 *
 * @param config - Full plugin configuration
 * @returns Backend-specific configuration with defaults applied
 * @throws Error if dbPath is missing or invalid
 */
export function resolveMemoryBackendConfig(config) {
    // Validate required field
    if (!config.dbPath) {
        throw new Error('Memory plugin config missing required field: dbPath');
    }
    if (typeof config.dbPath !== 'string' || config.dbPath.trim() === '') {
        throw new Error('Memory plugin config.dbPath must be a non-empty string');
    }
    // Apply defaults for optional fields
    const connectionMode = config.connectionMode ?? 'embedded';
    const tableName = config.tableName ?? 'memories';
    const embeddingDimension = config.embeddingDimension ?? 2560;
    return {
        dbPath: config.dbPath,
        connectionMode,
        tableName,
        embeddingDimension,
        embedding: config.embedding,
    };
}
//# sourceMappingURL=resolve-backend-config.js.map
