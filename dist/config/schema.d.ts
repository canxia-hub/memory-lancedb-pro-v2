/**
 * Phase 0 Minimal Configuration Schema
 *
 * Only includes fields required for Phase 0 skeleton.
 * Additional retrieval / interop / optional features will be added in later phases.
 *
 * Batch B: Added wiki supplement configuration fields.
 * Batch B: Added wiki supplement configuration fields.
 */
/**
 * Wiki vault configuration (Batch B)
 */
export interface WikiVaultConfig {
    /** Wiki vault path (defaults to ~/.openclaw/wiki/memory-vaults/memory-lancedb-pro-v2) */
    path?: string;
}
/**
 * Wiki context configuration (Batch B)
 */
export interface WikiContextConfig {
    /** Include compiled digest in prompt supplement (default: false) */
    includeCompiledDigestPrompt?: boolean;
}
/**
 * Obsidian integration configuration (Batch B)
 */
export interface ObsidianConfig {
    /** Enable Obsidian CLI integration (default: false) */
    enabled?: boolean;
}
/**
 * Retrieval configuration (Phase 0 minimal)
 */
export interface RetrievalConfig {
    /** Enable hybrid retrieval (vector + lexical/BM25) */
    hybrid: boolean;
    /** Enable rerank after hybrid retrieval */
    rerank: boolean;
}
/**
 * Host interop configuration (Phase 0 minimal)
 */
export interface HostInteropConfig {
    /** Enable public artifacts export */
    enableArtifacts: boolean;
    /** Enable host events emission */
    enableEvents: boolean;
}
/**
 * Memory Plugin Configuration (Phase 0 minimal + Phase C multimodal)
 */
export interface MemoryPluginConfig {
    /** Database storage path (required) */
    dbPath: string;
    /** Connection mode: embedded (local) or remote (server) */
    connectionMode: 'embedded' | 'remote';
    /** Table name in LanceDB (optional, has default) */
    tableName?: string;
    /** Embedding dimension (optional, has default) */
    embeddingDimension?: number;
    /** Default memory scope (optional) */
    defaultScope?: string;
    /** Retrieval settings */
    retrieval: RetrievalConfig;
    /** Host interop settings */
    hostInterop: HostInteropConfig;
    /** Assets table name (optional, has default) */
    assetsTableName?: string;
    /** Assets directory path (optional, derived from dbPath if not provided) */
    assetsPath?: string;
    /** Wiki vault configuration (Batch B) */
    vault?: WikiVaultConfig;
    /** Wiki context configuration (Batch B) */
    context?: WikiContextConfig;
    /** Obsidian integration configuration (Batch B) */
    obsidian?: ObsidianConfig;
}
/**
 * Default values for optional fields
 */
export declare const DEFAULT_CONFIG: Partial<MemoryPluginConfig>;
/**
 * Default wiki vault path for v2 (Batch B)
 * Compatible with existing openclaw.json memory-wiki path pattern
 */
export declare const DEFAULT_WIKI_VAULT_PATH = "C:\\Users\\Administrator\\.openclaw\\wiki\\memory-vaults\\memory-lancedb-pro-v2";
//# sourceMappingURL=schema.d.ts.map