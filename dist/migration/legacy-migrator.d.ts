/**
 * Legacy Memory Migrator
 *
 * Migrates memories from old memory-lancedb-pro to v2 LanceDB store.
 * Preserves original IDs, timestamps, and metadata with full migration tracking.
 */
/**
 * Legacy memory entry schema (from memory-lancedb-pro).
 * Verified from real database: C:\Users\Administrator\.openclaw\memory\lancedb-pro
 */
export interface LegacyMemoryEntry {
    id: string;
    text: string;
    vector: number[] | Float32Array;
    category: 'preference' | 'fact' | 'decision' | 'entity' | 'other' | 'reflection';
    scope: string;
    importance: number;
    timestamp: number;
    metadata: Record<string, unknown>;
}
/**
 * V2 memory record schema (target format).
 * Aligned with src/store/lancedb-store.ts MemoryRecord.
 */
export interface V2MemoryRecord {
    id: string;
    scope: string;
    content: string;
    embedding: number[] | null;
    category: string;
    importance: number;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
}
/**
 * Migration mode.
 */
export type MigrationMode = 'dry-run' | 'run' | 'skip-existing';
/**
 * Migration options.
 */
export interface MigrationOptions {
    /** Source database path (defaults to legacy path) */
    sourceDbPath?: string;
    /** Target database path (required for run mode) */
    targetDbPath?: string;
    /** Target table name */
    targetTableName?: string;
    /** Migration mode */
    mode: MigrationMode;
    /** Default scope if missing */
    defaultScope?: string;
    /** Batch size for insert */
    batchSize?: number;
}
/**
 * Migration report.
 */
export interface MigrationReport {
    /** Source database path */
    sourceDbPath: string;
    /** Target database path */
    targetDbPath: string;
    /** Source record count */
    sourceCount: number;
    /** Migrated count */
    migratedCount: number;
    /** Skipped count (existing IDs) */
    skippedCount: number;
    /** Error count */
    errorCount: number;
    /** Detailed errors */
    errors: Array<{
        id?: string;
        message: string;
    }>;
    /** Migration started at (ISO 8601) */
    startedAt: string;
    /** Migration finished at (ISO 8601) */
    finishedAt: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Legacy vector dimension */
    legacyVectorDimension: number;
    /** Target vector dimension */
    targetVectorDimension: number;
    /** Mode used */
    mode: MigrationMode;
    /** Dry run result (if mode === 'dry-run') */
    dryRunResult?: {
        wouldMigrate: number;
        sampleRecords: Array<{
            id: string;
            scope: string;
            category: string;
            contentPreview: string;
        }>;
    };
}
/**
 * Get default legacy database paths to search.
 */
export declare function getDefaultLegacyPaths(): string[];
/**
 * Find legacy database path.
 */
export declare function findLegacyDatabase(explicitPath?: string): Promise<string | null>;
/**
 * Read all entries from legacy database.
 */
export declare function readLegacyEntries(sourceDbPath: string): Promise<{
    entries: LegacyMemoryEntry[];
    vectorDimension: number;
}>;
/**
 * Map legacy entry to v2 record.
 */
export declare function mapLegacyToV2(legacy: LegacyMemoryEntry, defaultScope: string): V2MemoryRecord;
/**
 * Check if ID exists in target database.
 */
export declare function checkIdExists(targetDbPath: string, targetTableName: string, id: string): Promise<boolean>;
/**
 * Legacy memory migrator.
 */
export declare class LegacyMigrator {
    /**
     * Run migration.
     */
    migrate(options: MigrationOptions): Promise<MigrationReport>;
    /**
     * Get migration status (probe source database without migration).
     */
    probe(): Promise<{
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
    }>;
    /**
     * Verify migration by comparing counts and sampling records.
     */
    verify(sourceDbPath: string, targetDbPath: string, targetTableName?: string): Promise<{
        valid: boolean;
        sourceCount: number;
        targetCount: number;
        matchedSamples: number;
        mismatchedSamples: Array<{
            id: string;
            issue: string;
        }>;
    }>;
}
/**
 * Create legacy migrator instance.
 */
export declare function createLegacyMigrator(): LegacyMigrator;
/**
 * Convenience function for one-shot migration.
 */
export declare function migrateFromLegacy(options: MigrationOptions): Promise<MigrationReport>;
//# sourceMappingURL=legacy-migrator.d.ts.map