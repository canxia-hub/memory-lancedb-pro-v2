# Memory LanceDB Pro v4

Capability-first LanceDB memory plugin for OpenClaw — hybrid retrieval, Wiki knowledge graph with vector search, per-agent working-memory（工作任务）lanes, and incremental build.

**Production-proven**: 767+ memories, 142 wiki pages vector-indexed, 4350 graph nodes / 5435 edges, 279/279 vitest passing, 48 working-memory task records migrated from the retired file layer.

## Quick Facts

| Item | Detail |
|------|--------|
| Version | 4.1.0 |
| OpenClaw | >=2026.5.6 |
| Tools | 24 (10 memory + 8 wiki + 6 working-memory) |
| Tests | 279 (11 test files) |
| DB | LanceDB 0.33 embedded |
| Embedding | 2560-dim (DashScope tongyi-embedding-vision-flash) |
| Tables | `memories` + `wiki_pages` + `working_memory` (fully isolated) |
| Retrieval | Hybrid: FTS (BM25) + Vector (cosine) + Lexical |
| Wiki | Graph + Vector Search + Incremental Build |

---

## Architecture

```
dist/
  index.js                  ← Plugin entry (definePluginEntry)
  config/                   ← Config resolve + schema + backend config
  store/
    lancedb-store.js        ← LanceDB 0.33 store (BITMAP + FTS indexes)
    asset-store.js          ← Multimodal asset indexing
    migrations.js           ← Schema migration manager
    scope-manager.js        ← Memory scope normalization
  retrieval/
    embedder.js             ← DashScope multimodal embedding (2560-dim)
    hybrid-retriever.js     ← FTS + Vector + Lexical three-way fusion
    search-manager.js       ← Public search interface (MemorySearchResult)
    rerank.js               ← External rerank provider (optional)
  tools/
    register.js             ← Tool registration + context init
    store.js                ← memory_store
    recall.js               ← memory_recall
    list.js                 ← memory_list
    promote.js              ← memory_promote
    update.js               ← memory_update
    archive.js              ← memory_archive
    diagnostics.js          ← memory_stats + memory_debug
    wiki-tools.js           ← 8 wiki tools registration
  wiki/
    wiki-store.js           ← Wiki vault CRUD
    wiki-graph.js           ← Graph build (full + incremental) + query
    wiki-extractor.js       ← Markdown content extractor
    wiki-index.js           ← Category index builder
    wiki-doctor.js          ← Vault health checker
    wiki-sync-links.js      ← Backlink synchronizer
    wiki-supplement.js      ← Corpus + prompt supplements (3-way fusion)
    digest-compiler.js      ← Compiled digest generator
    wiki-vector-index.js    ← P1: Vector index for wiki pages
    build-manifest.js       ← P2: File fingerprint tracking
    obsidian-cli.js         ← Obsidian CLI probe (optional)
  capture/
    sanitization.js         ← Envelope sludge detection
    policy.js               ← Recall query normalization
    prompt-defense.js       ← Prompt injection detection + escape
  dreaming/
    engine.js               ← Dreaming 3-phase sweep engine
    config.js               ← Dreaming config + source aliases
  hooks/
    auto-memory.js          ← Auto-recall hooks (agent_end)
  interop/
    memory-capability.js    ← Memory capability runtime
    public-artifacts.js     ← Public artifacts provider
    host-events.js          ← Host events manager
  doctor/
    cli.js                  ← Doctor CLI (schema validation + cleanup)
  state/
    plugin-state.js         ← openKeyedStore persistence
  migration/
    index.js                ← Legacy v0→v2 migration
```

---

## Tools (24)

### Memory Tools (10)

| Tool | Description |
|------|-------------|
| `memory_store` | Store a memory with embedding |
| `memory_recall` | Hybrid search (FTS + Vector + Lexical) |
| `memory_list` | List memories with filters |
| `memory_update` | Update an existing memory |
| `memory_archive` | Archive (soft-delete) a memory |
| `memory_promote` | Promote memory to durable/core |
| `memory_stats` | Memory statistics |
| `memory_debug` | Retrieval pipeline debug trace |
| `memory_migrate_legacy` | Migrate from legacy database |
| `memory_forget` | Permanently delete a memory |

### Wiki Tools (8)

| Tool | Description |
|------|-------------|
| `wiki_status` | Vault mode, health, Obsidian CLI availability |
| `wiki_new` | Create new wiki entry with front matter |
| `wiki_get` | Read wiki entry by path or lookup term |
| `wiki_query` | Query knowledge graph by keyword |
| `wiki_build` | Build graph (incremental by default, `force:true` for full) |
| `wiki_doctor` | Lint vault: broken links, stale graph, health |
| `wiki_index` | Rebuild category indexes + main INDEX.md |
| `wiki_sync_links` | Synchronize backlinks across all entries |

### Working Memory（工作任务）Tools (6)

Per-agent task execution state in an independent `working_memory` table (no vectors, no dreaming sweep exposure). Tool factories bind `ctx.agentId` → `agent:<id>` lane: writes are lane-isolated, cross-lane reads allowed via explicit `scope`, and `crossAgentWriteAllowlist` (default `["main"]`) grants main-agent 代管 writes.

| Tool | Description |
|------|-------------|
| `memory_wm_get` | 查询本车道最新活动任务（或按 taskId / 跨车道只读 / yaml 输出） |
| `memory_wm_create` | 在本车道创建工作任务（wm-YYYY-MM-DD-topic） |
| `memory_wm_update` | 补丁式更新任务字段（status=completed/abandoned 自动写 completed_at） |
| `memory_wm_append` | 追加式更新数组字段（decisions/learnings/risks/artifacts 等，高频推荐） |
| `memory_wm_list` | 列出任务（默认本车道非归档；scope 跨车道只读；scopes=true 全车道概览） |
| `memory_wm_archive` | 归档任务（状态迁移为 archived，ARCHIVE-RULES 必填校验，仍可查询） |

The legacy `.working-memory/` file layer was fully retired on 2026-08-07: 48 task records across 8 agent lanes migrated into the table (file backup retained), and all agent core files were adapted to the `memory_wm_*` interface.

---

## Feature Matrix

### Enabled by Default

| Feature | Description |
|---------|-------------|
| **Hybrid Retrieval** | Three-way fusion: FTS (BM25, icu tokenizer) + Vector (cosine, native LanceDB) + Lexical (fallback). Sigmoid normalization for BM25 scores. |
| **Wiki Vector Search** | Independent `wiki_pages` table with full-page embedding. Three-way fusion: vector x0.5 + keyword x0.3 + graph x0.2. Graceful degradation when embedding unavailable. |
| **Wiki Incremental Build** | File fingerprint tracking (`build-manifest.json`, mtime + contentHash). Only re-extracts changed files. Dangling edge cleanup. No-change detection skips rebuild. |
| **Wiki Corpus Supplement** | Wiki search integrated into `memory_recall` pipeline via corpus supplement interface. |
| **autoRecall** | Automatic memory recall on agent turn end, with prompt injection defense and envelope sludge filtering. |
| **access_count** | Recall access tracking with write-back. Feeds dreaming deep promotion quality scoring. |
| **Dreaming Sweep** | 3-phase: light archive + deep promote + REM create. Scheduled via cron. |
| **Doctor CLI** | Schema validation + contamination cleanup (`openclaw doctor`). |
| **Host Interop** | Public artifacts provider + host events manager. |
| **Plugin State** | openKeyedStore persistence (fire-and-forget, honest degradation). |
| **Legacy Migration** | Automatic v0→v2 schema upgrade with skip-existing idempotency. |
| **Working Memory（工作任务）** | Independent `working_memory` table (no vectors). 6 `memory_wm_*` tools with per-agent lane isolation via tool-factory binding (`ctx.agentId` → `agent:<id>`). Archive = status migration with ARCHIVE-RULES required-field validation. One-shot migration script with dry-run + skipExisting idempotency. |

### Disabled by Default

| Feature | Description | Reason |
|---------|-------------|--------|
| **includeCompiledDigestPrompt** | Compiled wiki digest injected into prompt | Offline assessment pending. Enable via config `context.includeCompiledDigestPrompt: true`. |
| **Semantic Edge Inference** | LLM-powered semantic edges in wiki graph | Not implemented in TypeScript (graceful degradation). Use Python wiki_ops.py for semantic builds. |
| **Dreaming Engine** | Background dreaming process | Engine created but not started. Enable via config `dreaming.enabled: true`. |
| **Rerank** | External rerank provider | Requires additional config (`retrieval.rerankProvider`, `retrieval.rerankModel`, `retrieval.rerankBaseUrl`). |
| **Obsidian CLI** | Obsidian vault integration | Probe available but Obsidian not installed on this host. Auto-detects if installed. |

### Removed in v4

| Feature | Reason |
|---------|--------|
| **autoCapture / customTriggers** | Permanently removed per user decision. Redundant with agent-initiated `memory_store` / `/remember`. Capture library modules retained for recall path (policy/sanitization/prompt-defense). |

---

## Retrieval Pipeline

```
memory_recall("query")
  ├── FTS Search (BM25, icu tokenizer, sigmoid normalization)
  ├── Vector Search (cosine, native LanceDB vectorSearch)
  ├── Lexical Search (fallback, term frequency + exact match bonus)
  ├── Three-way Fusion (configurable weights)
  ├── Rerank (optional, external provider)
  └── Wiki Corpus Supplement
        ├── Vector Search (wiki_pages table, cosine)
        ├── Keyword Match (title + body)
        ├── Graph Query (graph.json node matching)
        └── Fusion: vector×0.5 + keyword×0.3 + graph×0.2
```

## Wiki Build Pipeline

```
wiki_build()                    ← Incremental by default
  ├── Load build-manifest.json
  ├── Scan vault fingerprints (mtime + contentHash)
  ├── Detect changes (added / modified / deleted / unchanged)
  ├── If no changes → skip rebuild
  ├── If changes:
  │     ├── Re-extract changed files only
  │     ├── Remove deleted/modified file nodes/edges
  │     ├── Merge with unchanged graph
  │     ├── Clean dangling edges
  │     ├── Deduplicate nodes
  │     ├── Detect communities
  │     ├── Export graph.json + GRAPH_REPORT.md + graph.html
  │     ├── Update digest
  │     └── Update vector index (wiki_pages)
  └── Save manifest

wiki_build({ force: true })     ← Full rebuild
  ├── Extract all files
  ├── Build graph from scratch
  ├── Clean dangling edges
  ├── Detect communities
  ├── Export all outputs
  ├── Compile digest
  ├── Rebuild vector index
  └── Save manifest
```

## Storage

| Table | Purpose | Schema |
|-------|---------|--------|
| `memories` | User memories | id, scope, content, embedding[2560], category, importance, createdAt, updatedAt, metadata |
| `wiki_pages` | Wiki vector index | id, path, title, content, embedding[2560], category, tags, updatedAt, metadata |
| `memory_assets` | Multimodal assets | id, memoryId, modality, mimeType, storagePath, ... |
| `working_memory` | Working-memory（工作任务）task state | id, task_id, scope (agent:<id> lane), goal, status, priority, plan/decisions/learnings/... (JSON), created_at, updated_at, completed_at, archived_at |

**Indexes**: BITMAP on `scope`/`category` (memories), BITMAP on `category` (wiki_pages), FTS on `content` (memories, icu tokenizer).

## Development

```bash
# Install
npm install

# Type check
npm run typecheck

# Test (279 tests)
npm test

# Integration tests
node scripts/test-wiki-vector-index.mjs
node scripts/test-wiki-incremental-build.mjs
```

## Configuration

```jsonc
{
  "plugins": {
    "entries": {
      "memory-lancedb-pro": {
        "config": {
          "dbPath": "path/to/lancedb",
          "tableName": "memories",
          "embeddingDimension": 2560,
          "connectionMode": "embedded",
          "retrieval": {
            "hybrid": true,
            "rerank": false
          },
          "vault": {
            "path": "path/to/wiki"
          },
          "context": {
            "includeCompiledDigestPrompt": false  // default: false
          },
          "hostInterop": {
            "enableArtifacts": true,
            "enableEvents": true
          },
          "dreaming": {
            "enabled": false  // default: false
          },
          "workingMemory": {
            "enabled": true,                      // default: true; false fully unloads memory_wm_* tools
            "tableName": "working_memory",
            "crossAgentWriteAllowlist": ["main"], // agents allowed to write other lanes (代管)
            "yamlFormatDefault": false
          }
        }
      }
    }
  }
}
```

## License

Apache-2.0
