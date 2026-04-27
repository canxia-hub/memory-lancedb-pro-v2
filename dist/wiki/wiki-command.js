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
import { checkWikiHealth, formatHealthReport, } from './wiki-doctor.js';
import { queryGraph, buildWikiGraph, } from './wiki-graph.js';
import { probeObsidianCli, } from './obsidian-cli.js';
// ============================================================================
// Output Helpers
// ============================================================================
/**
 * Write output to stdout (or provided writer).
 */
function writeOutput(output, writer) {
    const target = writer ?? process.stdout;
    target.write(output.endsWith('\n') ? output : `${output}\n`);
}
/**
 * Format result as JSON or use custom renderer.
 */
function formatJsonOrText(result, json, render) {
    return json ? JSON.stringify(result, null, 2) : render(result);
}
// ============================================================================
// Command Handlers
// ============================================================================
/**
 * Run wiki status command.
 *
 * Reports Obsidian CLI availability and vault status.
 */
async function runWikiStatus(params) {
    // Probe Obsidian CLI
    const obsidianProbe = await probeObsidianCli();
    // Build status report
    const status = {
        obsidian: {
            available: obsidianProbe.available,
            command: obsidianProbe.command,
        },
        vault: {
            path: params.config?.vault?.path ?? 'default',
            obsidianEnabled: params.config?.obsidian?.enabled ?? false,
        },
        context: {
            includeCompiledDigestPrompt: params.config?.context?.includeCompiledDigestPrompt ?? false,
        },
    };
    const output = formatJsonOrText(status, params.json, (s) => {
        const lines = [
            'Wiki Status',
            '─'.repeat(40),
            `Obsidian CLI: ${s.obsidian.available ? `available (${s.obsidian.command})` : 'not available'}`,
            `Vault path: ${s.vault.path}`,
            `Obsidian integration: ${s.vault.obsidianEnabled ? 'enabled' : 'disabled'}`,
            `Compiled digest in prompt: ${s.context.includeCompiledDigestPrompt ? 'enabled' : 'disabled'}`,
        ];
        return lines.join('\n');
    });
    writeOutput(output);
}
/**
 * Run wiki query command.
 *
 * Queries the wiki graph for matching nodes.
 */
async function runWikiQuery(params) {
    try {
        const result = await queryGraph(params.query);
        // Limit results if specified
        const limitedNodes = params.maxResults
            ? result.matchedNodes.slice(0, params.maxResults)
            : result.matchedNodes;
        const output = formatJsonOrText({ nodes: limitedNodes, edges: result.relatedEdges, graphWasStale: result.graphWasStale }, params.json, (r) => {
            if (r.nodes.length === 0) {
                return `No results found for query: ${params.query}`;
            }
            const lines = [
                `Query: ${params.query}`,
                `Results: ${r.nodes.length} nodes, ${r.edges.length} related edges`,
                '─'.repeat(40),
            ];
            for (const item of r.nodes) {
                lines.push(`  [score: ${item.score}] ${item.node.label} (${item.node.nodeType})`);
            }
            if (r.graphWasStale) {
                lines.push('\n⚠️  Graph may be stale - consider running wiki build');
            }
            return lines.join('\n');
        });
        writeOutput(output);
    }
    catch (error) {
        const err = error;
        writeOutput(params.json
            ? JSON.stringify({ error: err.message }, null, 2)
            : `Error: ${err.message}`);
    }
}
/**
 * Run wiki build command.
 *
 * Builds the wiki knowledge graph.
 */
async function runWikiBuild(params) {
    try {
        const wikiRoot = params.config?.vault?.path;
        const result = await buildWikiGraph({
            wikiRoot,
            semantic: params.semantic,
            model: params.model,
        });
        const output = formatJsonOrText(result, params.json, (r) => {
            const lines = [
                'Wiki Graph Build Complete',
                '─'.repeat(40),
                `Nodes: ${r.graph.nodes.length}`,
                `Edges: ${r.graph.edges.length}`,
                `Communities: ${r.analysis.totalCommunities}`,
                `Semantic edges: ${r.analysis.semanticEdges}`,
                '',
                `Graph: ${r.graphPath}`,
                `Report: ${r.reportPath}`,
                `HTML: ${r.htmlPath}`,
            ];
            return lines.join('\n');
        });
        writeOutput(output);
    }
    catch (error) {
        const err = error;
        writeOutput(params.json
            ? JSON.stringify({ error: err.message }, null, 2)
            : `Error: ${err.message}`);
    }
}
/**
 * Run wiki doctor command.
 *
 * Performs health checks on the wiki vault.
 */
async function runWikiDoctor(params) {
    try {
        const result = await checkWikiHealth();
        // Set exit code if unhealthy
        if (!result.healthy) {
            process.exitCode = 1;
        }
        const output = formatJsonOrText(result, params.json, formatHealthReport);
        writeOutput(output);
    }
    catch (error) {
        const err = error;
        writeOutput(params.json
            ? JSON.stringify({ error: err.message }, null, 2)
            : `Error: ${err.message}`);
    }
}
/**
 * Run Obsidian CLI status check.
 */
async function runObsidianStatus(params) {
    const result = await probeObsidianCli();
    const output = formatJsonOrText(result, params.json, (r) => {
        return r.available
            ? `Obsidian CLI available at ${r.command}`
            : 'Obsidian CLI is not available on PATH.';
    });
    writeOutput(output);
}
// ============================================================================
// Registration Function
// ============================================================================
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
export function registerWikiCli(program, config, appConfig) {
    // Phase G: Support both CommandLike and unknown program parameter
    const cliProgram = program;
    if (!cliProgram || typeof cliProgram.command !== 'function') {
        console.warn('Wiki CLI registration skipped: program parameter invalid');
        return;
    }
    const wiki = cliProgram
        .command('wiki')
        .description('Inspect and manage the wiki knowledge vault');
    // wiki status
    wiki
        .command('status')
        .description('Show wiki vault and Obsidian CLI status')
        .option('--json', 'Output as JSON')
        .action(async (...args) => {
        const opts = args[0];
        await runWikiStatus({ config, json: opts.json });
    });
    // wiki query
    wiki
        .command('query')
        .description('Query the wiki knowledge graph')
        .argument('<query>', 'Search query')
        .option('--max-results <n>', 'Maximum results', (v) => Number(v))
        .option('--json', 'Output as JSON')
        .action(async (...args) => {
        // Commander passes positional args first, then options object at the end
        const query = args[0];
        const opts = args[args.length - 1];
        await runWikiQuery({ query, maxResults: opts.maxResults, json: opts.json });
    });
    // wiki build
    wiki
        .command('build')
        .description('Build the wiki knowledge graph')
        .option('--semantic', 'Enable semantic edge inference')
        .option('--model <model>', 'LLM model for semantic inference')
        .option('--json', 'Output as JSON')
        .action(async (...args) => {
        const opts = args[0];
        await runWikiBuild({ config, semantic: opts.semantic, model: opts.model, json: opts.json });
    });
    // wiki doctor
    wiki
        .command('doctor')
        .description('Perform health checks on wiki vault')
        .option('--json', 'Output as JSON')
        .action(async (...args) => {
        const opts = args[0];
        await runWikiDoctor({ json: opts.json });
    });
    // wiki obsidian (subcommand group)
    const obsidian = wiki
        .command('obsidian')
        .description('Obsidian CLI integration helpers');
    obsidian
        .command('status')
        .description('Check Obsidian CLI availability')
        .option('--json', 'Output as JSON')
        .action(async (...args) => {
        const opts = args[0];
        await runObsidianStatus({ json: opts.json });
    });
}
//# sourceMappingURL=wiki-command.js.map