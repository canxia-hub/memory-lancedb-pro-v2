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
 * Default values for optional fields
 */
export const DEFAULT_CONFIG = {
    connectionMode: 'embedded',
    tableName: 'memories',
    embeddingDimension: 2560,
    defaultScope: 'default',
    retrieval: {
        hybrid: true,
        rerank: false,
        rerankProvider: 'none',
        rerankModel: 'qwen3-vl-rerank',
        rerankBaseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank',
        rerankApiKeyEnv: 'DASHSCOPE_API_KEY',
    },
    hostInterop: {
        enableArtifacts: true,
        enableEvents: true,
    },
    vault: {
        path: undefined,
    },
    context: {
        includeCompiledDigestPrompt: false,
    },
    obsidian: {
        enabled: false,
    },
    embedding: {
        provider: 'dashscope',
        model: 'tongyi-embedding-vision-flash-2026-03-06',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding',
        apiKeyEnv: 'DASHSCOPE_API_KEY',
        nativeDimension: 768,
        storageDimension: 2560,
    },
};
/**
 * Default wiki vault path for v2 (Batch B)
 * Compatible with existing openclaw.json memory-wiki path pattern
 */
export const DEFAULT_WIKI_VAULT_PATH = 'C:\\Users\\Administrator\\.openclaw\\wiki\\memory-vaults\\memory-lancedb-pro-v2';
//# sourceMappingURL=schema.js.map
