/**
 * memory-lancedb-pro v3 — Tool Types
 *
 * Re-exports SDK tool types for type-safe tool registration.
 * Phase 2 deliverable: replaces hand-written AnyAgentTool.
 */
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

// Re-export SDK types
export type { AnyAgentTool, OpenClawPluginApi };

/**
 * Plugin configuration (simplified — full schema in dist/config/schema.js).
 */
export interface MemoryPluginConfig {
  dbPath: string;
  connectionMode: "embedded" | "remote";
  tableName: string;
  embeddingDimension: number;
  defaultScope: string;
  retrieval: {
    hybrid: boolean;
    rerank: boolean;
    rerankProvider: "none" | "dashscope";
    rerankModel: string;
    rerankBaseUrl: string;
    rerankApiKeyEnv: string;
  };
  hostInterop: {
    enableArtifacts: boolean;
    enableEvents: boolean;
  };
  assetsTableName: string;
  assetsPath?: string;
  vault?: { path?: string };
  context?: { includeCompiledDigestPrompt?: boolean };
  obsidian?: { enabled?: boolean };
  embedding: {
    provider: string;
    model: string;
    baseUrl: string;
    apiKeyEnv: string;
    nativeDimension: number;
    storageDimension: number;
  };
}

/**
 * Resolved backend config (simplified).
 */
export interface BackendConfig {
  dbPath: string;
  connectionMode: string;
  tableName: string;
  embeddingDimension: number;
  assetsTableName?: string;
  assetsPath?: string;
}

/**
 * Tool registration context.
 */
export interface ToolRegistrationContext {
  config: MemoryPluginConfig;
  backendConfig: BackendConfig;
}

/**
 * Memory store input.
 */
export interface MemoryStoreInput {
  text: string;
  scope?: string;
  category?: "preference" | "fact" | "decision" | "entity" | "reflection" | "other";
  importance?: number;
  sourceType?: "text" | "image" | "audio" | "video" | "file" | "compound";
  sourceRef?: string;
  assets?: MemoryAssetInput[];
}

export interface MemoryAssetInput {
  modality: "image" | "audio" | "video" | "file";
  mimeType: string;
  storagePath: string;
  sha256?: string;
  sizeBytes?: number;
  caption?: string;
}

/**
 * Memory recall options.
 */
export interface RecallOptions {
  query: string;
  scope?: string;
  category?: string;
  limit?: number;
  minScore?: number;
  mode?: "lexical" | "vector" | "hybrid";
}

/**
 * Registration options for tools.
 */
export interface ToolRegistrationOptions {
  enableManagementTools?: boolean;
  enableAliases?: boolean;
}
