/**
 * Public Artifacts Export
 *
 * Bridge contract for memory-wiki / host memory capability consumers.
 *
 * IMPORTANT:
 * - listArtifacts() must return an ARRAY, not a wrapped object
 * - each artifact must expose workspaceDir / agentIds / relativePath / absolutePath / kind / contentType
 * - bridge import is multi-workspace; when cfg is available, enumerate all agent workspaces
 */
/**
 * Public artifact kinds consumed by memory-wiki bridge.
 */
export type PublicArtifactType = 'memory-root' | 'daily-note' | 'dream-report' | 'event-log';
/**
 * Public artifact descriptor consumed by host bridge.
 */
export interface PublicArtifact {
    /** Workspace owning the artifact */
    workspaceDir: string;
    /** Agent ids associated with this workspace */
    agentIds: string[];
    /** Relative path inside workspace (POSIX style) */
    relativePath: string;
    /** Full absolute path */
    absolutePath: string;
    /** Bridge classification */
    kind: PublicArtifactType;
    /** Content type for bridge consumers */
    contentType: string;
    /** File size (optional metadata) */
    size?: number;
    /** Last modified timestamp (optional metadata) */
    modifiedAt?: string;
}
/**
 * Public artifacts list result.
 * Host bridge expects a plain array.
 */
export type PublicArtifactsList = PublicArtifact[];
/**
 * Public artifacts options.
 */
export interface PublicArtifactsOptions {
    /** Fallback/root workspace dir */
    vaultRoot: string;
    /** Optional full app config so all workspaces can be enumerated */
    cfg?: unknown;
}
/**
 * Public artifacts provider interface registered through memory capability.
 */
export interface PublicArtifactsProvider {
    /** List active artifacts across one or more workspaces */
    listArtifacts(options?: {
        cfg?: unknown;
    }): Promise<PublicArtifactsList>;
    /** Quick existence probe for standard artifacts in fallback workspace */
    hasStandardArtifacts(): boolean;
    /** Read artifact content from fallback workspace */
    getArtifactContent(relativePath: string): string | null;
}
/**
 * Error thrown when publicArtifacts.listArtifacts() is called but the vault
 * is not properly configured. This prevents upstream sync from misinterpreting
 * an empty result as "should delete all imported sources".
 *
 * IMPORTANT: This is a protective measure against destructive sync bugs.
 */
export declare class VaultNotReadyError extends Error {
    readonly vaultRoot: string;
    readonly reason: 'vault-not-found' | 'no-standard-artifacts' | 'workspace-mismatch';
    constructor(vaultRoot: string, reason: 'vault-not-found' | 'no-standard-artifacts' | 'workspace-mismatch', message: string);
}
/**
 * Create provider bound to a fallback workspace root.
 *
 * PROTECTION (Scheme A): listArtifacts() validates vault readiness before
 * returning results. If vault is not accessible or lacks standard artifacts,
 * it throws VaultNotReadyError instead of returning empty array.
 *
 * This prevents upstream syncMemoryWikiBridgeSources from executing
 * destructive prune when artifacts count appears to be 0.
 */
export declare function createPublicArtifactsProvider(vaultRoot: string): PublicArtifactsProvider;
/**
 * Enumerate bridge artifacts across configured workspaces.
 */
export declare function listPublicArtifacts(options: PublicArtifactsOptions): PublicArtifactsList;
/**
 * Quick probe for fallback workspace standard artifacts.
 */
export declare function hasStandardArtifacts(vaultRoot: string): boolean;
/**
 * Read artifact content from fallback workspace.
 */
export declare function getArtifactContent(vaultRoot: string, relativePath: string): string | null;
/**
 * Standard artifact paths for reference.
 */
export declare const ARTIFACT_PATHS: {
    MEMORY_MD: string;
    DREAMS_MD: string;
    MEMORY_DIR: string;
    DREAMING_DIR: string;
    EVENTS_LOG: string;
};
//# sourceMappingURL=public-artifacts.d.ts.map