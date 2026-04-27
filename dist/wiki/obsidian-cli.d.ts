/**
 * Obsidian CLI Integration Module
 *
 * Windows-safe implementation for probing and running Obsidian CLI commands.
 * Minimal viable implementation - focuses on core functionality:
 * - probeObsidianCli(): Check if Obsidian CLI is available
 * - runObsidianCommand(): Execute an Obsidian command by ID
 * - runObsidianDaily(): Open today's daily note
 *
 * Reference: upstream extensions/memory-wiki/src/obsidian.ts
 */
import { execFile } from 'node:child_process';
declare const execFileAsync: typeof execFile.__promisify__;
/**
 * Result of probing Obsidian CLI availability.
 */
export interface ObsidianCliProbe {
    /** Whether Obsidian CLI is available on PATH */
    available: boolean;
    /** Resolved command path if available */
    command: string | null;
}
/**
 * Result of running an Obsidian CLI command.
 */
export interface ObsidianCliResult {
    /** The command that was executed */
    command: string;
    /** Arguments passed to the command */
    argv: string[];
    /** stdout from the command */
    stdout: string;
    /** stderr from the command */
    stderr: string;
}
/**
 * Optional vault configuration for Obsidian.
 */
export interface ObsidianVaultConfig {
    /** Vault name (optional) */
    vaultName?: string;
}
/**
 * Dependencies for testing/mocking.
 */
interface ObsidianCliDeps {
    exec?: typeof execFileAsync;
    resolveCommand?: (command: string) => Promise<string | null>;
}
/**
 * Resolve a command name to its full path on PATH.
 *
 * On Windows, accounts for PATHEXT extensions (.EXE, .CMD, .BAT, etc).
 */
export declare function resolveCommandOnPath(command: string): Promise<string | null>;
/**
 * Probe whether Obsidian CLI is available on PATH.
 *
 * Returns a result object with availability status, never throws.
 *
 * @param deps Optional dependencies for testing
 * @returns Probe result with availability and resolved command
 */
export declare function probeObsidianCli(deps?: Pick<ObsidianCliDeps, 'resolveCommand'>): Promise<ObsidianCliProbe>;
/**
 * Execute an Obsidian CLI command.
 *
 * @param params Command parameters
 * @returns Execution result with stdout/stderr
 * @throws Error if Obsidian CLI is not available
 */
export declare function runObsidianCli(params: {
    config?: ObsidianVaultConfig;
    subcommand: string;
    args?: string[];
    deps?: ObsidianCliDeps;
}): Promise<ObsidianCliResult>;
/**
 * Execute an Obsidian command by palette ID.
 *
 * Example: `runObsidianCommand({ id: 'app:open-vault' })`
 *
 * @param params Command parameters
 * @returns Execution result
 */
export declare function runObsidianCommand(params: {
    config?: ObsidianVaultConfig;
    id: string;
    deps?: ObsidianCliDeps;
}): Promise<ObsidianCliResult>;
/**
 * Open today's daily note in Obsidian.
 *
 * @param params Daily note parameters
 * @returns Execution result
 */
export declare function runObsidianDaily(params: {
    config?: ObsidianVaultConfig;
    deps?: ObsidianCliDeps;
}): Promise<ObsidianCliResult>;
/**
 * Search the Obsidian vault for content.
 *
 * Note: This is optional for minimal implementation.
 * Full implementation would include open/search subcommands.
 *
 * @param params Search parameters
 * @returns Execution result
 */
export declare function runObsidianSearch(params: {
    config?: ObsidianVaultConfig;
    query: string;
    deps?: ObsidianCliDeps;
}): Promise<ObsidianCliResult>;
/**
 * Open a file in Obsidian by vault-relative path.
 *
 * Note: This is optional for minimal implementation.
 *
 * @param params Open parameters
 * @returns Execution result
 */
export declare function runObsidianOpen(params: {
    config?: ObsidianVaultConfig;
    vaultPath: string;
    deps?: ObsidianCliDeps;
}): Promise<ObsidianCliResult>;
export {};
//# sourceMappingURL=obsidian-cli.d.ts.map