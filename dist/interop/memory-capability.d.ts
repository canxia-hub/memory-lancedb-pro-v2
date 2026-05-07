/**
 * Memory Capability Registration
 *
 * Host-facing runtime bridge for shared search + status consumers.
 *
 * IMPORTANT CONTRACTS:
 * - getMemorySearchManager(params) => Promise<{ manager, error }>
 * - resolveMemoryBackendConfig(params) => backend summary object
 * - closeAllMemorySearchManagers() supported for host cleanup
 */
import { MemoryPluginConfig } from '../config/schema.js';
import { MemoryBackendConfig } from '../config/resolve-backend-config.js';
import { SearchManager, SearchManagerStatus } from '../retrieval/search-manager.js';
/**
 * Host-facing runtime contract.
 */
export interface MemoryCapabilityRuntime {
    /** Resolve an active search manager for shared-search consumers */
    getMemorySearchManager(params?: unknown): Promise<{
        manager: SearchManager | null;
        error?: string;
    }>;
    /** Resolve backend summary for host consumers */
    resolveMemoryBackendConfig(params?: unknown): {
        backend: 'builtin';
        citations: boolean;
        custom?: {
            pluginId: string;
            dbPath: string;
            tableName: string;
            connectionMode: string;
        };
    };
    /** Optional host cleanup hook */
    closeAllMemorySearchManagers(): Promise<void>;
    /** Internal/diagnostic helpers */
    getCapabilityStatus(): Promise<MemoryCapabilityStatus>;
    initialize(): Promise<void>;
    close(): Promise<void>;
}
/**
 * Memory capability status.
 */
export interface MemoryCapabilityStatus {
    capabilityId: string;
    registered: boolean;
    search: SearchManagerStatus;
    artifactsEnabled: boolean;
    eventsEnabled: boolean;
    backend: {
        dbPath: string;
        tableName: string;
        connectionMode: string;
    };
}
export interface MemoryCapabilityOptions {
    config: MemoryPluginConfig;
    backendConfig?: MemoryBackendConfig;
}
export declare function createMemoryCapabilityRuntime(options: MemoryCapabilityOptions): MemoryCapabilityRuntime;
export declare function getMemoryCapabilityRuntime(): MemoryCapabilityRuntime | null;
export declare function getMemorySearchManager(params?: unknown): Promise<{
    manager: SearchManager | null;
    error?: string;
}>;
export declare function resolveBackendConfigForCapability(config: MemoryPluginConfig): MemoryBackendConfig;
export declare function createAndInitializeMemoryCapability(config: MemoryPluginConfig): Promise<MemoryCapabilityRuntime>;
export { SearchManager, SearchManagerStatus, SearchOptions, EmbeddingAvailability, } from '../retrieval/search-manager.js';
//# sourceMappingURL=memory-capability.d.ts.map