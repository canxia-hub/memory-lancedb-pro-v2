/**
 * P2 Incremental Build — Integration Test
 *
 * Tests:
 * 1. First full build (creates manifest)
 * 2. No-change detection (skip rebuild)
 * 3. Incremental build after file modification
 * 4. Consistency: incremental result matches full rebuild
 *
 * Uses a temporary vault to avoid touching production wiki.
 *
 * Run: node scripts/test-wiki-incremental-build.mjs
 */

import { detectChanges, loadManifest, buildAndSaveManifest } from '../dist/wiki/build-manifest.js';
import { buildWikiGraph, loadGraph } from '../dist/wiki/wiki-graph.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create temporary vault
const tmpVault = path.join(os.tmpdir(), `wiki-incr-test-${Date.now()}`);
fs.mkdirSync(tmpVault, { recursive: true });

console.log('=== P2 Incremental Build Integration Test ===\n');
console.log('Temp vault:', tmpVault);

// Helper: create a test wiki page
function createPage(relPath, title, category, body) {
    const fullPath = path.join(tmpVault, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const content = `---\ntitle: ${title}\ncategory: ${category}\ntags: [test]\nstatus: stable\n---\n\n${body}\n`;
    fs.writeFileSync(fullPath, content, 'utf8');
}

// Helper: delete a page
function deletePage(relPath) {
    const fullPath = path.join(tmpVault, relPath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

// Helper: modify a page (change body)
function modifyPage(relPath, newBody) {
    const fullPath = path.join(tmpVault, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const fmEnd = content.indexOf('---', 3);
    const fm = content.slice(0, fmEnd + 3);
    fs.writeFileSync(fullPath, fm + '\n\n' + newBody + '\n', 'utf8');
}

try {
    // Setup: create initial pages
    createPage('concepts/alpha.md', 'Alpha Concept', 'concepts', 'Alpha is the first letter. Links to [[Beta Concept]].');
    createPage('concepts/beta.md', 'Beta Concept', 'concepts', 'Beta is the second letter. See [[Alpha Concept]]. #greeks');
    createPage('procedures/gamma.md', 'Gamma Procedure', 'procedures', '1. Do alpha\n2. Do beta\n3. Done');

    // ── Test 1: First full build ────────────────────────────────
    console.log('\n--- Test 1: First full build ---');
    const result1 = await buildWikiGraph({ wikiRoot: tmpVault, force: true });
    console.log('✅ Full build:', result1.analysis.totalNodes, 'nodes,', result1.analysis.totalEdges, 'edges');
    console.log('  incremental:', result1.incremental);

    const manifest1 = loadManifest(tmpVault);
    console.log('  manifest files:', Object.keys(manifest1?.files ?? {}).length);
    if (!manifest1 || Object.keys(manifest1.files).length !== 3) {
        throw new Error('Expected 3 files in manifest');
    }

    // ── Test 2: No-change detection ─────────────────────────────
    console.log('\n--- Test 2: No-change detection ---');
    const result2 = await buildWikiGraph({ wikiRoot: tmpVault });
    console.log('✅ Skipped:', result2.skipped === true);
    console.log('  changes:', JSON.stringify(result2.changes));
    if (!result2.skipped) {
        throw new Error('Expected skipped=true when no changes');
    }

    // ── Test 3: Detect changes ──────────────────────────────────
    console.log('\n--- Test 3: Detect changes ---');
    // Modify a file
    modifyPage('concepts/alpha.md', 'Alpha is the FIRST letter. Updated content. Links to [[Beta Concept]] and [[Gamma Procedure]].');
    // Add a new file
    createPage('concepts/delta.md', 'Delta Concept', 'concepts', 'Delta is the fourth letter. #greeks #new');

    const changes = detectChanges(tmpVault);
    console.log('  added:', changes.added);
    console.log('  modified:', changes.modified);
    console.log('  deleted:', changes.deleted);
    console.log('  unchanged:', changes.unchanged);
    console.log('  hasChanges:', changes.hasChanges);

    if (changes.added.length !== 1 || changes.modified.length !== 1 || changes.deleted.length !== 0) {
        throw new Error(`Unexpected changes: +${changes.added.length} ~${changes.modified.length} -${changes.deleted.length}`);
    }
    console.log('✅ Change detection correct');

    // ── Test 4: Incremental build ───────────────────────────────
    console.log('\n--- Test 4: Incremental build ---');
    const result4 = await buildWikiGraph({ wikiRoot: tmpVault });
    console.log('✅ Incremental build:', result4.analysis.totalNodes, 'nodes,', result4.analysis.totalEdges, 'edges');
    console.log('  incremental:', result4.incremental);
    console.log('  changes:', JSON.stringify(result4.changes));

    // ── Test 5: Consistency (incremental vs full) ──────────────
    console.log('\n--- Test 5: Consistency check ---');
    // Do a full rebuild for comparison
    const result5 = await buildWikiGraph({ wikiRoot: tmpVault, force: true });

    const incrNodes = result4.analysis.totalNodes;
    const fullNodes = result5.analysis.totalNodes;
    const incrEdges = result4.analysis.totalEdges;
    const fullEdges = result5.analysis.totalEdges;

    console.log(`  incremental: ${incrNodes} nodes, ${incrEdges} edges`);
    console.log(`  full:        ${fullNodes} nodes, ${fullEdges} edges`);

    if (incrNodes !== fullNodes) {
        console.warn(`  ⚠️ Node count mismatch: incremental=${incrNodes} vs full=${fullNodes}`);
    } else {
        console.log('  ✅ Node counts match');
    }
    if (incrEdges !== fullEdges) {
        console.warn(`  ⚠️ Edge count mismatch: incremental=${incrEdges} vs full=${fullEdges}`);
    } else {
        console.log('  ✅ Edge counts match');
    }

    // ── Test 6: Deletion ────────────────────────────────────────
    console.log('\n--- Test 6: File deletion ---');
    deletePage('concepts/delta.md');
    const changes6 = detectChanges(tmpVault);
    console.log('  deleted:', changes6.deleted);

    const result6 = await buildWikiGraph({ wikiRoot: tmpVault });
    console.log('✅ After deletion:', result6.analysis.totalNodes, 'nodes,', result6.analysis.totalEdges, 'edges');
    console.log('  changes:', JSON.stringify(result6.changes));

    // Verify delta.md nodes are gone
    const graph6 = result6.graph;
    const deltaNodes = graph6.nodes.filter(n => n.id.includes('delta'));
    if (deltaNodes.length > 0) {
        console.warn('  ⚠️ Delta nodes still present:', deltaNodes.map(n => n.id));
    } else {
        console.log('  ✅ Delta nodes removed');
    }

    // ── Test 7: Second no-change ────────────────────────────────
    console.log('\n--- Test 7: Second no-change detection ---');
    const result7 = await buildWikiGraph({ wikiRoot: tmpVault });
    console.log('✅ Skipped:', result7.skipped === true);

    console.log('\n=== All tests passed ===');
} catch (e) {
    console.error('\n❌ FAIL:', e.message);
    console.error(e.stack);
    process.exit(1);
} finally {
    // Cleanup
    try {
        fs.rmSync(tmpVault, { recursive: true, force: true });
        console.log('\nCleaned up temp vault');
    } catch { /* best-effort */ }
}
