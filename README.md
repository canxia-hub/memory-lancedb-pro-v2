# memory-lancedb-pro-v2

> LanceDB memory plugin for OpenClaw — persistent semantic memory with wiki knowledge graph.

## Overview

A **memory slot plugin** for [OpenClaw](https://github.com/openclaw/openclaw) that provides persistent, searchable long-term memory powered by [LanceDB](https://lancedb.com/).

### Features

- **Persistent Storage** — LanceDB embedded, data survives Gateway restarts
- **Hybrid Retrieval** — Vector similarity + keyword search with optional rerank
- **Legacy Migration** — 655 memories migrated from v1 with idempotent verification
- **Multimodal Assets** — Index and search image/audio/video/file assets
- **Wiki Knowledge Graph** — 8 wiki tools (pure TypeScript, zero Python dependency)
- **Host Interop** — Public artifacts export + host events emission

### Tools

| Category | Tools |
|----------|-------|
| **Core Memory** | `memory_store`, `memory_recall`, `memory_list`, `memory_update`, `memory_archive`, `memory_forget` |
| **Management** | `memory_promote`, `memory_stats`, `memory_debug`, `memory_migrate_legacy` |
| **Wiki** | `wiki_status`, `wiki_doctor`, `wiki_query`, `wiki_get`, `wiki_new`, `wiki_build`, `wiki_index`, `wiki_sync_links` |

## Installation

```json
// openclaw.json
{
  "plugins": {
    "slots": { "memory": "memory-lancedb-pro-v2" },
    "installs": {
      "memory-lancedb-pro-v2": {
        "source": "path",
        "spec": "path/to/memory-lancedb-pro-v2"
      }
    }
  }
}
```

## Configuration

```json
{
  "dbPath": "path/to/lancedb",
  "connectionMode": "embedded",
  "tableName": "memories",
  "embeddingDimension": 2560,
  "defaultScope": "default",
  "retrieval": { "hybrid": true, "rerank": false },
  "hostInterop": { "enableArtifacts": true, "enableEvents": true },
  "assetsTableName": "memory_assets",
  "vault": { "path": "path/to/wiki/vault" }
}
```

## Dependencies & Attribution

This project is a fork and evolution of [memory-lancedb-pro](https://github.com/CortexReach/memory-lancedb-pro) by CortexReach.

Built upon excellent open-source work:

| Dependency | License | Usage |
|------------|---------|-------|
| [memory-lancedb-pro](https://github.com/CortexReach/memory-lancedb-pro) | MIT | Original plugin foundation |
| [LanceDB](https://github.com/lancedb/lancedb) | Apache 2.0 | Vector database engine |
| [Apache Arrow](https://arrow.apache.org/) | Apache 2.0 | Columnar data format |
| [OpenAI Node](https://github.com/openai/openai-node) | Apache 2.0 | Embedding generation |
| [OpenClaw](https://github.com/openclaw/openclaw) | — | Plugin runtime host |
| [graphify-openclaw](https://github.com/canxia-hub/graphify-openclaw) | MIT | Wiki graph inspiration (Python source ported to TypeScript) |

## License

Apache License 2.0 — see [LICENSE](LICENSE)

## Development

The plugin evolved through a 6-day team-orchestrated engineering sprint (2026-04-23 ~ 2026-04-28):

1. **Phase 0-1**: Platform schema + store/retrieval skeleton
2. **Phase 2**: Persistent LanceDB storage + 655-record legacy migration
3. **Phase 3**: Multimodal asset indexing (image/audio/video/file)
4. **Phase 4**: Wiki knowledge graph integration (8 tools, removed standalone memory-wiki)
5. **Phase 5**: Dreaming auto-consolidation (explored, deprecated due to plugin bloat)
6. **Phase 6**: Final polish — promote MEMORY.md writing, Python dependency removal, SQLite cache purge

### Building

```bash
git clone https://github.com/canxia-hub/memory-lancedb-pro-v2.git
cd memory-lancedb-pro-v2
npm install
npx tsc
```

Built with TypeScript, compiled to `dist/`.
