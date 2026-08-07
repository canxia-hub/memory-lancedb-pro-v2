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
        fts: true,
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
 * Default wiki vault path for v3 prompt/corpus supplements.
 * Align with wiki-store WIKI_ROOT so tools, corpus supplement, and compiled digest
 * read the same vault by default. Can still be overridden by config.vault.path.
 */
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '';
export const DEFAULT_WIKI_VAULT_PATH = process.env.WIKI_ROOT
    || process.env.OPENCLAW_WIKI_ROOT
    || (HOME_DIR ? `${HOME_DIR}/.openclaw/wiki` : '.openclaw/wiki');
//# sourceMappingURL=schema.js.map
