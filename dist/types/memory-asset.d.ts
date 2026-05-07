/**
 * Memory Asset Types
 *
 * Defines types for multimodal asset indexing layer.
 * Assets are stored separately from main memories table,
 * with only index/metadata information in the database.
 */
/**
 * Asset modality types
 */
export type AssetModality = 'image' | 'audio' | 'video' | 'file';
/**
 * Source type for memory records
 */
export type SourceType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'compound';
/**
 * Input for creating a memory asset record.
 * Used when storing multimodal assets alongside memories.
 */
export interface MemoryAssetInput {
    /** Asset modality type */
    modality: AssetModality;
    /** MIME type (e.g., 'image/png', 'audio/mp3') */
    mimeType: string;
    /** Storage path relative to assets directory */
    storagePath: string;
    /** SHA256 hash of the asset file (for dedup/CAS) */
    sha256?: string;
    /** File size in bytes */
    sizeBytes?: number;
    /** Human-readable caption/description */
    caption?: string;
    /** OCR extracted text (for images) */
    ocrText?: string;
    /** Audio/video transcript */
    transcript?: string;
    /** AI-generated summary */
    summary?: string;
    /** Embedding vector for the asset (optional) */
    embedding?: number[];
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}
/**
 * Memory asset record stored in database.
 * Full record with all fields populated.
 */
export interface MemoryAssetRecord {
    /** Unique asset identifier (UUID) */
    assetId: string;
    /** Associated memory ID */
    memoryId: string;
    /** Asset modality */
    modality: AssetModality;
    /** MIME type */
    mimeType: string;
    /** Storage path */
    storagePath: string;
    /** SHA256 hash */
    sha256: string | null;
    /** Size in bytes */
    sizeBytes: number | null;
    /** Caption */
    caption: string | null;
    /** OCR text */
    ocrText: string | null;
    /** Transcript */
    transcript: string | null;
    /** Summary */
    summary: string | null;
    /** Embedding vector */
    embedding: number[] | null;
    /** ISO 8601 creation timestamp */
    createdAt: string;
    /** Metadata JSON string */
    metadataJson: string;
}
/**
 * Asset store status information.
 */
export interface AssetStoreStatus {
    /** Whether asset store is initialized */
    initialized: boolean;
    /** Assets table name */
    tableName: string;
    /** Assets directory path */
    assetsPath: string;
    /** Total asset records count */
    totalAssets: number;
    /** Whether vector column exists */
    hasVectors: boolean;
    /** Error if not available */
    error?: string;
}
/**
 * Asset query options.
 */
export interface AssetQueryOptions {
    /** Filter by memory ID */
    memoryId?: string;
    /** Filter by modality */
    modality?: AssetModality;
    /** Max results */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}
/**
 * Asset creation result.
 */
export interface AssetCreateResult {
    /** Created asset record */
    asset: MemoryAssetRecord;
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
}
/**
 * Batch asset creation result.
 */
export interface AssetBatchCreateResult {
    /** Created asset records */
    assets: MemoryAssetRecord[];
    /** Number of successful creations */
    successCount: number;
    /** Number of failed creations */
    failCount: number;
    /** Errors for failed creations */
    errors: Array<{
        index: number;
        error: string;
    }>;
    /** Overall success (all succeeded) */
    success: boolean;
}
/**
 * Asset list result.
 */
export interface AssetListResult {
    /** Asset records */
    assets: MemoryAssetRecord[];
    /** Total count */
    total: number;
    /** Success indicator */
    success: boolean;
    /** Error if failed */
    error?: string;
}
//# sourceMappingURL=memory-asset.d.ts.map