/**
 * LanceDB Store - Real Persistent Implementation
 *
 * Real LanceDB persistence with file-based storage.
 * Replaces Phase 1 in-memory fallback with true database operations.
 */
import { MemoryBackendConfig } from '../config/resolve-backend-config.js';
/**
 * Internal memory record structure.
 * Richer than public MemorySearchResult, but must be mapped before export.
 */
export interface MemoryRecord {
    /** Unique record identifier (UUID or similar) */
    id: string;
    /** Memory scope */
    scope: string;
    /** Memory content text */
    content: string;
    /** Embedding vector (optional - may be null if not yet embedded) */
    embedding?: number[] | null;
    /** Category: preference/fact/decision/entity/reflection/other */
    category: string;
    /** Importance score 0-1 */
    importance: number;
    /** ISO 8601 timestamp when created */
    createdAt: string;
    /** ISO 8601 timestamp when last updated */
    updatedAt: string;
    /** Optional metadata */
    metadata?: Record<string, unknown>;
}
/**
 * Memory record input for creation/update.
 */
export interface MemoryRecordInput {
    content: string;
    scope?: string;
    category?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Query options for listing/searching records.
 */
export interface StoreQueryOptions {
    scope?: string;
    category?: string;
    limit?: number;
    offset?: number;
    orderBy?: 'createdAt' | 'updatedAt' | 'importance';
    orderDirection?: 'asc' | 'desc';
}
/**
 * Store status information.
 */
export interface StoreStatus {
    /** Whether store is connected and ready */
    connected: boolean;
    /** Database path */
    dbPath: string;
    /** Table name */
    tableName: string;
    /** Total record count (approximate) */
    totalRecords: number;
    /** Connection mode */
    connectionMode: 'embedded' | 'remote';
    /** Whether vector column exists and is populated */
    hasVectors: boolean;
    /** Embedding dimension if vectors exist */
    embeddingDimension?: number;
}
/**
 * Minimal LanceDB Store interface.
 */
export interface LanceDBStore {
    /** Initialize and connect to database */
    initialize(): Promise<void>;
    /** Close connection */
    close(): Promise<void>;
    /** Create a new memory record */
    create(input: MemoryRecordInput): Promise<MemoryRecord>;
    /** Get record by id */
    get(id: string, scope?: string): Promise<MemoryRecord | null>;
    /** Update existing record */
    update(id: string, updates: Partial<MemoryRecordInput>, scope?: string): Promise<MemoryRecord | null>;
    /** Delete record by id */
    delete(id: string, scope?: string): Promise<boolean>;
    /** List records with query options */
    list(options?: StoreQueryOptions): Promise<MemoryRecord[]>;
    /** Get store status */
    status(): Promise<StoreStatus>;
    /** Probe vector availability (for search manager) */
    probeVectorAvailability(): Promise<VectorAvailability>;
}
/**
 * Vector availability probe result.
 */
export interface VectorAvailability {
    /** Whether vector column exists */
    hasVectorColumn: boolean;
    /** Whether any records have embeddings */
    hasPopulatedVectors: boolean;
    /** Embedding dimension if available */
    dimension?: number;
    /** Percentage of records with embeddings (0-100) */
    populationPercentage?: number;
    /** Reason if unavailable */
    unavailableReason?: string;
}
/**
 * Create LanceDB store instance.
 *
 * Real LanceDB persistence implementation.
 *
 * @param config - Backend configuration
 * @returns Store instance
 */
export declare function createLanceDBStore(config: MemoryBackendConfig): LanceDBStore;
//# sourceMappingURL=lancedb-store.d.ts.map