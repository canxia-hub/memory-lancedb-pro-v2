/**
 * Migrations Manager
 *
 * Phase 1 schema version tracking + legacy migrator bridge.
 * Provides:
 * - Schema version tracking (for future schema migrations)
 * - Legacy database migration (from memory-lancedb-pro)
 */
import { MigrationReport, MigrationOptions } from '../migration/legacy-migrator.js';
export { LegacyMigrator, MigrationReport, MigrationMode, MigrationOptions, createLegacyMigrator, } from '../migration/legacy-migrator.js';
/**
 * Migration status information.
 */
export interface MigrationStatus {
    /** Current schema version */
    currentVersion: number;
    /** Latest available schema version */
    latestVersion: number;
    /** Whether migrations are pending */
    hasPendingMigrations: boolean;
    /** List of pending migration names (if any) */
    pendingMigrations: string[];
    /** Last migration timestamp (ISO 8601) */
    lastMigrationAt?: string;
    /** Whether migration system is fully implemented */
    migrationSystemReady: boolean;
}
/**
 * Migration result.
 */
export interface MigrationResult {
    /** Whether migration succeeded */
    success: boolean;
    /** Version after migration */
    version: number;
    /** Applied migrations (if any) */
    appliedMigrations: string[];
    /** Error message (if failed) */
    error?: string;
    /** Duration in milliseconds */
    durationMs: number;
}
/**
 * Minimal migration interface.
 *
 * Phase 1 skeleton only provides:
 * - Version tracking
 * - Status reporting
 * - Placeholder for future migration logic
 *
 * NOT implemented in Phase 1:
 * - Automatic schema migrations
 * - Backward compatibility checks
 * - Data migration logic
 */
export interface MigrationManager {
    /** Get current migration status */
    status(): Promise<MigrationStatus>;
    /** Run pending migrations (Phase 1: placeholder) */
    runMigrations(): Promise<MigrationResult>;
    /** Check if migration is needed */
    needsMigration(): Promise<boolean>;
}
/**
 * Current schema version for Phase 1.
 * Will increment as schema evolves.
 */
export declare const CURRENT_SCHEMA_VERSION = 1;
/**
 * Latest schema version (same as current for Phase 1).
 */
export declare const LATEST_SCHEMA_VERSION = 1;
/**
 * Create minimal migration manager.
 *
 * Phase 1 skeleton - honest about not having full migration system.
 * Returns status but does not perform actual migrations.
 *
 * @param store - LanceDB store instance (for future integration)
 * @returns Migration manager instance
 */
export declare function createMigrationManager(store: unknown): MigrationManager;
/**
 * Legacy migration manager interface.
 */
export interface LegacyProbeResult {
    found: boolean;
    sourceDbPath?: string;
    sourceCount?: number;
    vectorDimension?: number;
    sampleEntries?: Array<{
        id: string;
        scope: string;
        category: string;
        contentPreview: string;
    }>;
}
export interface LegacyVerifyResult {
    valid: boolean;
    sourceCount: number;
    targetCount: number;
    matchedSamples: number;
    mismatchedSamples: Array<{
        id: string;
        issue: string;
    }>;
}
export interface LegacyMigrationManager {
    /** Probe legacy database */
    probe(): Promise<LegacyProbeResult>;
    /** Run migration */
    migrate(options: MigrationOptions): Promise<MigrationReport>;
    /** Verify migration */
    verify(sourceDbPath: string, targetDbPath: string, targetTableName?: string): Promise<LegacyVerifyResult>;
}
/**
 * Create legacy migration manager.
 */
export declare function createLegacyMigrationManager(): LegacyMigrationManager;
/**
 * Migration system capabilities (Phase 1 assessment).
 */
export declare const MIGRATION_CAPABILITIES: {
    /** Version tracking is available */
    hasVersionTracking: boolean;
    /** Automatic schema migration is NOT available */
    hasAutoSchemaMigration: boolean;
    /** Legacy data migration IS available */
    hasLegacyMigration: boolean;
    /** Backward compatibility checks are NOT available */
    hasCompatibilityChecks: boolean;
    /** Migration rollback is NOT available */
    hasRollback: boolean;
    /** Status: legacy migration implemented, schema migration pending */
    isFullyImplemented: boolean;
};
//# sourceMappingURL=migrations.d.ts.map