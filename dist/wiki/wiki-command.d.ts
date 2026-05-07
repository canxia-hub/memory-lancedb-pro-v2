/**
 * Wiki CLI Registration Module
 *
 * Provides registerWikiCli() function to register wiki subcommands with
 * OpenClaw's CLI. This module can be wired into the main CLI registration
 * at a later phase.
 *
 * Minimal implementation covers: status, query, build, doctor
 * Higher-write commands (new, apply) are deferred to future phases.
 *
 * Note: Commander types are imported dynamically at runtime.
 * This module expects the 'program' parameter to be a Commander instance
 * provided by OpenClaw's host.
 */
import type { MemoryPluginConfig } from '../config/schema.js';
/**
 * Minimal interface matching Commander's Command type.
 * Allows registration without direct Commander dependency.
 *
 * Note: action handler signature uses any to accommodate Commander's
 * dynamic argument resolution (options + positional args are merged).
 */
interface CommandLike {
    command(name: string): CommandLike;
    description(desc: string): CommandLike;
    option(flags: string, description?: string, fn?: (value: string, prev: unknown) => unknown, defaultValue?: unknown): CommandLike;
    argument(spec: string, description?: string): CommandLike;
    action(handler: (...args: unknown[]) => void | Promise<void>): CommandLike;
}
/**
 * Options for wiki status command.
 */
interface WikiStatusOptions {
    json?: boolean;
}
/**
 * Options for wiki query command.
 */
interface WikiQueryOptions {
    json?: boolean;
    maxResults?: number;
}
/**
 * Options for wiki build command.
 */
interface WikiBuildOptions {
    json?: boolean;
    semantic?: boolean;
    model?: string;
}
/**
 * Options for wiki doctor command.
 */
interface WikiDoctorOptions {
    json?: boolean;
}
/**
 * Register wiki CLI commands with a Commander program.
 *
 * Subcommands registered:
 * - status: Show wiki vault and Obsidian CLI status
 * - query: Query the wiki knowledge graph
 * - build: Build the wiki knowledge graph
 * - doctor: Perform health checks on wiki vault
 * - obsidian status: Check Obsidian CLI availability
 *
 * NOT YET IMPLEMENTED (deferred to future phases):
 * - new: Create new wiki entry (requires write ops)
 * - apply: Apply wiki mutations (requires write ops)
 * - ingest: Ingest sources into wiki (requires write ops)
 *
 * @param program Commander program instance
 * @param config Resolved plugin config (optional)
 * @param appConfig OpenClaw app config (optional)
 */
export declare function registerWikiCli(program: CommandLike | unknown, config?: MemoryPluginConfig, appConfig?: unknown): void;
export type { CommandLike, WikiStatusOptions, WikiQueryOptions, WikiBuildOptions, WikiDoctorOptions, };
//# sourceMappingURL=wiki-command.d.ts.map