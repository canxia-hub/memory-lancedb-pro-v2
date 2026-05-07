# Memory LanceDB Pro v3

Capability-first LanceDB memory plugin for OpenClaw 5.6+ (17 tools, 706+ memories production-proven).

## Features

- **Hybrid retrieval** — vector + lexical + rerank (DashScope multimodal embeddings)
- **Multimodal assets** — image/audio/video/file indexing with type-safe schemas
- **Wiki knowledge graph** — Graphify-powered graph query, build, doctor, sync (8 tools)
- **Host interop** — artifacts + events (honest degradation)
- **Plugin state persistence** — openKeyedStore migration/statistics/search-cache (fire-and-forget init)
- **Legacy migration** — automatic v0→v2 schema upgrade (655 records migrated)

## Quick Facts

| Item | Detail |
|------|--------|
| Version | 3.0.0 |
| OpenClaw | >=2026.5.6 |
| Tools | 17 (9 memory + 8 wiki) |
| DB | LanceDB embedded |
| Embedding | 2560-dim (DashScope tongyi-embedding-vision-flash) |

## Structure

```
src/                  ← TypeScript sources (SDK typed)
  index.ts            ← entry point (definePluginEntry + OpenClawPluginApi)
  tools/types.ts      ← AnyAgentTool / MemoryStoreInput / RecallOptions
  state/index.ts      ← KeyedStore<T> / PluginState helpers

dist/                 ← Runtime JS (full business logic)
  index.js            ← SDK-aligned entry (Phase 2)
  state/plugin-state.js  ← openKeyedStore wrapper (Phase 3)
  config/             ← Config resolve + schema
  store/              ← LanceDB store + asset store + migrations
  retrieval/          ← Hybrid retriever + search manager + rerank
  tools/              ← Memory tools (store/recall/list/promote/update/archive/debug/stats/migrate)
  interop/            ← Memory capability + public artifacts + host events
  wiki/               ← Graphify wiki tools
  migration/          ← Legacy migration (v0→v2)
  types/              ← Shared type definitions

tests/                ← vitest test suite (Phase 5)
  manifest.test.ts    ← package.json + openclaw.plugin.json validation
  tools/recall.test.ts    ← entry point + SDK import + state module validation
  tools/promote.test.ts   ← promote/update/migration + TS source validation
  retrieval/hybrid.test.ts ← hybrid retrieval structure validation
```

## Development

```bash
# Install
npm install

# Type check
npm run typecheck

# Test (49 tests)
npm test
```

## Changelog

### v3.0.0 (2026-05-07)

- **Phase 1**: SDK `definePluginEntry` entry + `contracts.tools` manifest (17 tools)
- **Phase 2**: TypeScript `AnyAgentTool` / `OpenClawPluginApi` types + `tsc --noEmit`
- **Phase 3**: `openKeyedStore` state persistence (honest degradation, fire-and-forget)
- **Phase 4**: `openclaw.json` config migration (3 refs: allow/slots.memory/entries)
- **Phase 5**: vitest 49 tests (manifest + entry + tools + retrieval)
