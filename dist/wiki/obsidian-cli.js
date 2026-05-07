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
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
// ============================================================================
// Windows-Safe Command Resolution
// ============================================================================
/**
 * Check if a file path is executable (Windows: exists check).
 *
 * On Windows, executability is determined by file extension (PATHEXT)
 * and existence, not by file permissions.
 */
async function isExecutableFile(inputPath) {
    try {
        // On Windows, just check if file exists (no X_OK permission)
        await fs.access(inputPath, fsConstants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Resolve a command name to its full path on PATH.
 *
 * On Windows, accounts for PATHEXT extensions (.EXE, .CMD, .BAT, etc).
 */
export async function resolveCommandOnPath(command) {
    const pathValue = process.env.PATH ?? '';
    const pathEntries = pathValue.split(path.delimiter).filter(Boolean);
    // Windows-specific: PATHEXT contains extensions to try
    const windowsExts = process.platform === 'win32'
        ? (process.env.PATHEXT?.split(';').filter(Boolean) ?? ['.EXE', '.CMD', '.BAT'])
        : [''];
    // If command already contains path separator, check directly
    if (command.includes(path.sep)) {
        return (await isExecutableFile(command)) ? command : null;
    }
    // Search through PATH entries
    for (const dir of pathEntries) {
        for (const extension of windowsExts) {
            const candidate = path.join(dir, extension ? `${command}${extension}` : command);
            if (await isExecutableFile(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}
/**
 * Build vault prefix arguments if vaultName is configured.
 */
function buildVaultPrefix(config) {
    return config?.vaultName ? [`vault=${config.vaultName}`] : [];
}
// ============================================================================
// Probe Obsidian CLI
// ============================================================================
/**
 * Probe whether Obsidian CLI is available on PATH.
 *
 * Returns a result object with availability status, never throws.
 *
 * @param deps Optional dependencies for testing
 * @returns Probe result with availability and resolved command
 */
export async function probeObsidianCli(deps) {
    const resolveCommand = deps?.resolveCommand ?? resolveCommandOnPath;
    try {
        const command = await resolveCommand('obsidian');
        return {
            available: command !== null,
            command,
        };
    }
    catch (error) {
        // Graceful failure: return unavailable status
        return {
            available: false,
            command: null,
        };
    }
}
// ============================================================================
// Run Obsidian CLI Commands
// ============================================================================
/**
 * Execute an Obsidian CLI command.
 *
 * @param params Command parameters
 * @returns Execution result with stdout/stderr
 * @throws Error if Obsidian CLI is not available
 */
export async function runObsidianCli(params) {
    const resolveCommand = params.deps?.resolveCommand ?? resolveCommandOnPath;
    const exec = params.deps?.exec ?? execFileAsync;
    // Probe CLI availability
    const probe = await probeObsidianCli({ resolveCommand });
    if (!probe.command) {
        throw new Error('Obsidian CLI is not available on PATH.');
    }
    // Build argument list
    const argv = [
        ...buildVaultPrefix(params.config),
        params.subcommand,
        ...(params.args ?? []),
    ];
    // Execute command with timeout protection
    try {
        const { stdout, stderr } = await exec(probe.command, argv, {
            encoding: 'utf8',
            timeout: 30000, // 30 second timeout
            windowsHide: true, // Hide console window on Windows
        });
        return {
            command: probe.command,
            argv,
            stdout,
            stderr,
        };
    }
    catch (error) {
        // Handle timeout and other execution errors
        const err = error;
        if (err.code === 'ETIMEDOUT') {
            throw new Error(`Obsidian CLI command timed out: ${probe.command} ${argv.join(' ')}`);
        }
        throw new Error(`Obsidian CLI execution failed: ${err.message}`);
    }
}
/**
 * Execute an Obsidian command by palette ID.
 *
 * Example: `runObsidianCommand({ id: 'app:open-vault' })`
 *
 * @param params Command parameters
 * @returns Execution result
 */
export async function runObsidianCommand(params) {
    return await runObsidianCli({
        config: params.config,
        subcommand: 'command',
        args: [`id=${params.id}`],
        deps: params.deps,
    });
}
/**
 * Open today's daily note in Obsidian.
 *
 * @param params Daily note parameters
 * @returns Execution result
 */
export async function runObsidianDaily(params) {
    return await runObsidianCli({
        config: params.config,
        subcommand: 'daily',
        deps: params.deps,
    });
}
// ============================================================================
// Additional Helpers (Optional - Minimal Implementation)
// ============================================================================
/**
 * Search the Obsidian vault for content.
 *
 * Note: This is optional for minimal implementation.
 * Full implementation would include open/search subcommands.
 *
 * @param params Search parameters
 * @returns Execution result
 */
export async function runObsidianSearch(params) {
    return await runObsidianCli({
        config: params.config,
        subcommand: 'search',
        args: [`query=${params.query}`],
        deps: params.deps,
    });
}
/**
 * Open a file in Obsidian by vault-relative path.
 *
 * Note: This is optional for minimal implementation.
 *
 * @param params Open parameters
 * @returns Execution result
 */
export async function runObsidianOpen(params) {
    return await runObsidianCli({
        config: params.config,
        subcommand: 'open',
        args: [`path=${params.vaultPath}`],
        deps: params.deps,
    });
}
//# sourceMappingURL=obsidian-cli.js.map