/**
 * Memory Asset Store - Asset Indexing Layer
 *
 * Implements asset storage layer for multimodal memory assets.
 * Uses LanceDB for indexing, with file assets stored separately.
 *
 * Design:
 * - Main memories table stores text memory records
 * - memory_assets table stores asset index/metadata
 * - Actual asset files stored in assets directory (CAS-like)
 * - No binary blobs in database
 */
import { MemoryBackendConfig } from '../config/resolve-backend-config.js';
import { MemoryAssetInput, MemoryAssetRecord, AssetStoreStatus, AssetQueryOptions, AssetCreateResult, AssetBatchCreateResult, AssetListResult, AssetModality, SourceType } from '../types/memory-asset.js';
export { MemoryAssetInput, MemoryAssetRecord, AssetStoreStatus, AssetQueryOptions, AssetCreateResult, AssetBatchCreateResult, AssetListResult, AssetModality, SourceType, };
/**
 * Asset Store interface.
 */
export interface AssetStore {
    /** Initialize asset store */
    initialize(): Promise<void>;
    /** Close asset store */
    close(): Promise<void>;
    /** Create single asset record */
    create(memoryId: string, input: MemoryAssetInput): Promise<AssetCreateResult>;
    /** Batch create asset records */
    batchCreate(memoryId: string, inputs: MemoryAssetInput[]): Promise<AssetBatchCreateResult>;
    /** List assets by memory ID */
    listByMemoryId(memoryId: string, options?: AssetQueryOptions): Promise<AssetListResult>;
    /** List assets by modality type */
    listByModality(modality: string, options?: AssetQueryOptions): Promise<AssetListResult>;
    /** Get asset by asset ID */
    get(assetId: string): Promise<MemoryAssetRecord | null>;
    /** Delete asset by asset ID */
    delete(assetId: string): Promise<boolean>;
    /** Get asset store status */
    status(): Promise<AssetStoreStatus>;
}
/**
 * Asset Store configuration.
 */
export interface AssetStoreConfig {
    /** Database path (dbPath from backend config) */
    dbPath: string;
    /** Assets table name (default: memory_assets) */
    tableName: string;
    /** Embedding dimension (from backend config) */
    embeddingDimension: number;
}
/**
 * Resolve asset store config from backend config.
 *
 * @param backendConfig - Memory backend configuration
 * @returns Asset store configuration
 */
export declare function resolveAssetStoreConfig(backendConfig: MemoryBackendConfig): AssetStoreConfig;
/**
 * Create Asset Store instance.
 *
 * @param config - Asset store configuration
 * @returns Asset store instance
 */
export declare function createAssetStore(config: AssetStoreConfig): AssetStore;
/**
 * Initialize global asset store.
 *
 * @param backendConfig - Backend configuration
 */
export declare function initializeAssetStore(backendConfig: MemoryBackendConfig): Promise<void>;
/**
 * Get global asset store instance.
 *
 * @returns Asset store instance
 */
export declare function getAssetStore(): AssetStore;
/**
 * Close global asset store.
 */
export declare function closeAssetStore(): Promise<void>;
//# sourceMappingURL=asset-store.d.ts.map