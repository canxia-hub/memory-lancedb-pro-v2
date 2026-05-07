/**
 * Migrations Manager
 *
 * Phase 1 schema version tracking + legacy migrator bridge.
 * Provides:
 * - Schema version tracking (for future schema migrations)
 * - Legacy database migration (from memory-lancedb-pro)
 */
import { createLegacyMigrator, } from '../migration/legacy-migrator.js';
// Re-export legacy migration types for convenience
export { LegacyMigrator, createLegacyMigrator, } from '../migration/legacy-migrator.js';
/**
 * Current schema version for Phase 1.
 * Will increment as schema evolves.
 */
export const CURRENT_SCHEMA_VERSION = 1;
/**
 * Latest schema version (same as current for Phase 1).
 */
export const LATEST_SCHEMA_VERSION = 1;
/**
 * Create minimal migration manager.
 *
 * Phase 1 skeleton - honest about not having full migration system.
 * Returns status but does not perform actual migrations.
 *
 * @param store - LanceDB store instance (for future integration)
 * @returns Migration manager instance
 */
export function createMigrationManager(store) {
    // Placeholder state
    let _lastMigrationAt = undefined;
    const manager = {
        async status() {
            return {
                currentVersion: CURRENT_SCHEMA_VERSION,
                latestVersion: LATEST_SCHEMA_VERSION,
                hasPendingMigrations: false,
                pendingMigrations: [],
                lastMigrationAt: _lastMigrationAt,
                migrationSystemReady: false, // Honest: not fully implemented
            };
        },
        async runMigrations() {
            // Phase 1 placeholder: no actual migrations
            const startTime = Date.now();
            // Honest: migration system not fully implemented
            return {
                success: true, // No migrations needed = success
                version: CURRENT_SCHEMA_VERSION,
                appliedMigrations: [],
                durationMs: Date.now() - startTime,
            };
        },
        async needsMigration() {
            // Phase 1: always false since no pending migrations
            return false;
        },
    };
    return manager;
}
/**
 * Create legacy migration manager.
 */
export function createLegacyMigrationManager() {
    const migrator = createLegacyMigrator();
    return {
        async probe() {
            return migrator.probe();
        },
        async migrate(options) {
            return migrator.migrate(options);
        },
        async verify(sourceDbPath, targetDbPath, targetTableName) {
            return migrator.verify(sourceDbPath, targetDbPath, targetTableName);
        },
    };
}
/**
 * Migration system capabilities (Phase 1 assessment).
 */
export const MIGRATION_CAPABILITIES = {
    /** Version tracking is available */
    hasVersionTracking: true,
    /** Automatic schema migration is NOT available */
    hasAutoSchemaMigration: false,
    /** Legacy data migration IS available */
    hasLegacyMigration: true,
    /** Backward compatibility checks are NOT available */
    hasCompatibilityChecks: false,
    /** Migration rollback is NOT available */
    hasRollback: false,
    /** Status: legacy migration implemented, schema migration pending */
    isFullyImplemented: false,
};
//# sourceMappingURL=migrations.js.map