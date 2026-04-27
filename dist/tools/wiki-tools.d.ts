/**
 * Wiki Tools - TypeScript Native Implementation
 *
 * Wiki 工具注册与接线，直接调用 TypeScript 实现。
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
/**
 * Register all Wiki tools with OpenClaw.
 *
 * @param registerTool - OpenClaw registerTool function
 */
export declare function registerAllWikiTools(registerTool: (tool: AnyAgentTool, opts?: {
    optional?: boolean;
}) => void): void;
export {};
//# sourceMappingURL=wiki-tools.d.ts.map