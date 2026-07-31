/**
 * Wiki Supplement - Batch B + M6 implementation
 *
 * Provides wiki corpus supplement and prompt supplement for memory-lancedb-pro-v3.
 * Vault-path-independent: works with any vault path, not just WIKI_ROOT.
 *
 * Reference: upstream memory-wiki corpus-supplement.ts + prompt-section.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { WIKI_ROOT } from './wiki-store.js';
import { queryGraph } from './wiki-graph.js';

// ============================================================================
// Constants
// ============================================================================
const AGENT_DIGEST_PATH = '.openclaw-wiki/cache/agent-digest.json';
const DIGEST_MAX_PAGES = 4;
const DIGEST_MAX_CLAIMS_PER_PAGE = 2;

// ============================================================================
// Vault-Path-Independent Helpers
// ============================================================================

/**
 * Parse front matter from raw content.
 */
function parseFrontMatterLocal(content) {
  if (!content.startsWith('---')) return null;
  const parts = content.split('---');
  if (parts.length < 3) return null;
  const yamlContent = parts[1].trim();
  const metadata = {};
  for (const line of yamlContent.split('\n')) {
    if (!line.includes(':')) continue;
    const colonIdx = line.indexOf(':');
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    if (key === 'tags') {
      if (value.startsWith('[') && value.endsWith(']')) {
        metadata.tags = value.slice(1, -1).split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(t => t.length > 0);
      }
    } else if (key === 'confidence') {
      metadata.confidence = parseFloat(value);
    } else {
      metadata[key] = value;
    }
  }
  if (!metadata.title || !metadata.category) return null;
  return {
    title: metadata.title, category: metadata.category, tags: metadata.tags || [],
    status: metadata.status || 'draft', agent: metadata.agent,
    confidence: metadata.confidence, created: metadata.created, updated: metadata.updated,
  };
}

/**
 * Extract body after front matter.
 */
function extractBodyFromRaw(content) {
  if (!content.startsWith('---')) return content;
  const parts = content.split('---');
  if (parts.length < 3) return content;
  return parts.slice(2).join('---').trim();
}

/**
 * Read a wiki page directly from a vault path.
 */
function readPageFromVault(vaultPath, relativePath) {
  const fullPath = path.join(vaultPath, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  try {
    const rawContent = fs.readFileSync(fullPath, 'utf8');
    const fm = parseFrontMatterLocal(rawContent);
    if (!fm) return null;
    const body = extractBodyFromRaw(rawContent);
    return { frontMatter: fm, body, rawContent, path: relativePath };
  } catch {
    return null;
  }
}

/**
 * Scan a vault directory for all .md files.
 */
function scanVaultFiles(vaultPath) {
  const results = [];
  if (!fs.existsSync(vaultPath)) return results;
  const skipDirs = new Set(['.openclaw-wiki', 'graphify-out', 'legacy', 'memory-vaults', 'archive', 'templates', 'node_modules', '.git']);

  function scanDir(dirPath, prefix) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = prefix ? path.join(prefix, entry.name).replace(/\\/g, '/') : entry.name;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name) && !entry.name.startsWith('.')) scanDir(fullPath, relPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        results.push(relPath);
      }
    }
  }

  const topEntries = fs.readdirSync(vaultPath, { withFileTypes: true });
  for (const entry of topEntries) {
    if (entry.isDirectory() && !skipDirs.has(entry.name) && !entry.name.startsWith('.')) {
      scanDir(path.join(vaultPath, entry.name), entry.name);
    }
  }
  return results;
}

function buildSnippet(rawContent, query) {
  const queryLower = query.toLowerCase();
  const lines = rawContent.split('\n');
  const matchingLine = lines.find(line => line.toLowerCase().includes(queryLower) && line.trim().length > 0);
  return matchingLine?.trim() || lines.find(l => l.trim().length > 0)?.trim() || '';
}

function buildGetResultFromPage(page, relativePath, fromLine, lineCount) {
  const lines = page.rawContent.split('\n');
  const totalLines = lines.length;
  const slice = lines.slice(fromLine - 1, fromLine - 1 + lineCount).join('\n');
  const truncated = fromLine - 1 + lineCount < totalLines;
  return {
    corpus: 'wiki',
    path: relativePath,
    title: page.frontMatter.title,
    kind: page.frontMatter.category,
    content: slice,
    fromLine,
    lineCount,
    totalLines,
    truncated,
    updatedAt: page.frontMatter.updated,
  };
}

// ============================================================================
// Wiki Corpus Supplement
// ============================================================================

export function createWikiCorpusSupplement(params) {
  const vaultPath = params.config.vault?.path || WIKI_ROOT;
  return {
    search: async (input) => {
      const maxResults = Math.max(1, input.maxResults ?? 10);
      const results = [];

      // 1. Query graph if available
      const graphPath = path.join(vaultPath, 'graphify-out', 'graph.json');
      if (fs.existsSync(graphPath) && results.length < maxResults) {
        try {
          const graphResult = await queryGraph(input.query, graphPath);
          for (const { node, score } of graphResult.matchedNodes.slice(0, maxResults - results.length)) {
            if (results.some(r => r.title === node.label)) continue;
            let snippet = node.label;
            let kind = node.nodeType || 'document';
            let updatedAt;
            if (node.sourceFile) {
              const relPath = path.relative(vaultPath, node.sourceFile).replace(/\\/g, '/');
              const page = readPageFromVault(vaultPath, relPath);
              if (page) {
                snippet = buildSnippet(page.rawContent, input.query);
                kind = page.frontMatter.category;
                updatedAt = page.frontMatter.updated;
              }
            }
            results.push({
              corpus: 'wiki',
              path: node.sourceFile ? path.relative(vaultPath, node.sourceFile).replace(/\\/g, '/') : node.id,
              title: node.label, kind, score, snippet,
              id: node.id, updatedAt,
            });
          }
        } catch { /* Graph query failed */ }
      }

      // 2. Fallback: scan vault files with keyword matching
      if (results.length < maxResults) {
        const allFiles = scanVaultFiles(vaultPath);
        for (const relPath of allFiles) {
          if (results.some(r => r.path === relPath)) continue;
          const page = readPageFromVault(vaultPath, relPath);
          if (!page) continue;
          const queryLower = input.query.toLowerCase();
          const titleLower = page.frontMatter.title.toLowerCase();
          const contentLower = page.body.toLowerCase();
          let score = 0;
          if (titleLower.includes(queryLower)) score += 20;
          if (contentLower.includes(queryLower)) score += 5;
          if (score > 0) {
            results.push({
              corpus: 'wiki',
              path: relPath,
              title: page.frontMatter.title,
              kind: page.frontMatter.category,
              score,
              snippet: buildSnippet(page.rawContent, input.query),
              updatedAt: page.frontMatter.updated,
            });
          }
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, maxResults);
    },

    get: async (input) => {
      const fromLine = Math.max(1, input.fromLine ?? 1);
      const lineCount = Math.max(1, input.lineCount ?? 200);
      let relativePath = input.lookup.trim().replace(/\\/g, '/');
      if (!relativePath.endsWith('.md')) relativePath += '.md';

      const page = readPageFromVault(vaultPath, relativePath);
      if (page) return buildGetResultFromPage(page, relativePath, fromLine, lineCount);

      // Try with category prefix
      for (const cat of ['concepts', 'decisions', 'procedures', 'references', 'snippets']) {
        const tryPath = path.join(cat, relativePath).replace(/\\/g, '/');
        const tryPage = readPageFromVault(vaultPath, tryPath);
        if (tryPage) return buildGetResultFromPage(tryPage, tryPath, fromLine, lineCount);
      }
      return null;
    },
  };
}

// ============================================================================
// Wiki Prompt Section Builder
// ============================================================================

export function createWikiPromptSectionBuilder(config) {
  const vaultPath = config.vault?.path || WIKI_ROOT;
  const includeDigest = config.context?.includeCompiledDigestPrompt ?? false;
  return ({ availableTools }) => {
    const digestLines = includeDigest ? buildDigestPromptSection(vaultPath) : [];
    const toolGuidance = buildWikiToolGuidance(availableTools);
    if (digestLines.length === 0 && toolGuidance.length === 0) return [];
    return [...toolGuidance, ...digestLines];
  };
}

function tryReadPromptDigest(vaultPath) {
  const digestPath = path.join(vaultPath, AGENT_DIGEST_PATH);
  if (!fs.existsSync(digestPath)) return null;
  try {
    const raw = fs.readFileSync(digestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch { return null; }
}

function rankPromptDigestPage(page) {
  return (page.contradictions?.length ?? 0) * 6 +
    (page.questions?.length ?? 0) * 4 +
    Math.min(page.claimCount ?? 0, 6) * 2 +
    Math.min(page.topClaims?.length ?? 0, 3);
}

function rankPromptClaimFreshness(level) {
  switch (level) {
    case 'fresh': return 3;
    case 'aging': return 2;
    case 'stale': return 1;
    default: return 0;
  }
}

function sortPromptClaims(claims) {
  return [...claims].sort((left, right) => {
    const lc = typeof left.confidence === 'number' ? left.confidence : -1;
    const rc = typeof right.confidence === 'number' ? right.confidence : -1;
    if (lc !== rc) return rc - lc;
    const lf = rankPromptClaimFreshness(left.freshnessLevel);
    const rf = rankPromptClaimFreshness(right.freshnessLevel);
    if (lf !== rf) return rf - lf;
    return left.text.localeCompare(right.text);
  });
}

function formatPromptClaim(claim) {
  const qualifiers = [
    claim.status?.trim() ? `status ${claim.status.trim()}` : null,
    typeof claim.confidence === 'number' ? `confidence ${claim.confidence.toFixed(2)}` : null,
    claim.freshnessLevel?.trim() ? `freshness ${claim.freshnessLevel.trim()}` : null,
  ].filter(Boolean);
  if (qualifiers.length === 0) return claim.text;
  return `${claim.text} (${qualifiers.join(', ')})`;
}

function buildDigestPromptSection(vaultPath) {
  const digest = tryReadPromptDigest(vaultPath);
  if (!digest?.pages?.length) return [];

  const selectedPages = [...digest.pages]
    .filter(p => (p.claimCount ?? 0) > 0 || (p.questions?.length ?? 0) > 0 || (p.contradictions?.length ?? 0) > 0)
    .sort((a, b) => {
      const sa = rankPromptDigestPage(a);
      const sb = rankPromptDigestPage(b);
      if (sa !== sb) return sb - sa;
      return a.title.localeCompare(b.title);
    })
    .slice(0, DIGEST_MAX_PAGES);

  if (selectedPages.length === 0) return [];

  const lines = [
    '## Compiled Wiki Snapshot',
    `Compiled wiki currently tracks ${digest.claimCount ?? 0} claims across ${selectedPages.length} high-signal pages.`,
  ];
  if (Array.isArray(digest.contradictionClusters)) {
    lines.push(`Contradiction clusters: ${digest.contradictionClusters.length}.`);
  }
  for (const page of selectedPages) {
    const details = [
      page.kind,
      `${page.claimCount} claims`,
      (page.questions?.length ?? 0) > 0 ? `${page.questions.length} open questions` : null,
      (page.contradictions?.length ?? 0) > 0 ? `${page.contradictions.length} contradiction notes` : null,
    ].filter(Boolean);
    lines.push(`- ${page.title}: ${details.join(', ')}`);
    for (const claim of sortPromptClaims(page.topClaims ?? []).slice(0, DIGEST_MAX_CLAIMS_PER_PAGE)) {
      lines.push(`  - ${formatPromptClaim(claim)}`);
    }
  }
  lines.push('');
  return lines;
}

function buildWikiToolGuidance(availableTools) {
  const hasWikiSearch = availableTools.has('wiki_search');
  const hasWikiGet = availableTools.has('wiki_get');
  const hasWikiQuery = availableTools.has('wiki_query');
  const hasWikiBuild = availableTools.has('wiki_build');
  const hasWikiDoctor = availableTools.has('wiki_doctor');
  const hasMemoryRecall = availableTools.has('memory_recall');

  if (!hasWikiSearch && !hasWikiGet && !hasWikiQuery && !hasWikiBuild && !hasWikiDoctor && !hasMemoryRecall) return [];

  const lines = [
    '## Compiled Wiki',
    'Use the wiki when the answer depends on accumulated project knowledge, prior syntheses, entity pages, or source-backed notes that should survive beyond one conversation.',
  ];
  if (hasMemoryRecall) lines.push('Use `memory_recall` to retrieve stored preferences, facts, and decisions from long-term memory.');
  if (hasWikiSearch && hasWikiGet) lines.push('Workflow: `wiki_search` first, then `wiki_get` for the exact page you need.');
  else if (hasWikiSearch) lines.push('Use `wiki_search` before answering from stored knowledge when you want wiki-specific ranking.');
  else if (hasWikiGet) lines.push('Use `wiki_get` to inspect specific wiki pages by path/id.');
  if (hasWikiQuery) lines.push('Use `wiki_query` to search the wiki knowledge graph for structured relationship queries.');
  if (hasWikiBuild) lines.push('Use `wiki_build` to rebuild the knowledge graph after significant wiki updates.');
  if (hasWikiDoctor) lines.push('After meaningful wiki updates, run `wiki_doctor` to check vault health before trusting the graph.');
  lines.push('');
  return lines;
}
