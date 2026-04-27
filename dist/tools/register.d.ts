/**
 * Tool Registration - Minimal Implementation
 *
 * Phase 2+5 wiring - wraps tool functions into AgentTool format.
 * Uses plain JSON Schema for parameters (no TypeBox dependency).
 */
type AnyAgentTool = {
    name: string;
    description: string;
    parameters: unknown;
    execute: (params: Record<string, unknown>) => Promise<{
        content: Array<{
            type: string;
            text: string;
        }>;
        details: unknown;
    }>;
};
import { MemoryPluginConfig } from "../config/schema.js";
import { MemoryBackendConfig } from "../config/resolve-backend-config.js";
/**
 * Tool registration context.
 */
export interface ToolRegistrationContext {
    config: MemoryPluginConfig;
    backendConfig: MemoryBackendConfig;
}
/**
 * Initialize tool context (called by plugin register).
 */
export declare function initializeToolContext(context: ToolRegistrationContext): Promise<void>;
/**
 * Close tool context (called by plugin reload/cleanup).
 */
export declare function closeToolContext(): Promise<void>;
/**
 * Register all memory tools with OpenClaw.
 *
 * @param registerTool - OpenClaw registerTool function
 * @param options - Registration options
 */
export declare function registerAllMemoryTools(registerTool: (tool: AnyAgentTool, opts?: {
    optional?: boolean;
}) => void, options?: {
    enableManagementTools?: boolean;
    enableAliases?: boolean;
}): void;
export {};
//# sourceMappingURL=register.d.ts.map