# M4 Dreaming Engine Verification Report

**Date**: 2026-07-31
**Executor**: subagent (m4-dreaming-engine)
**Target**: `C:\Users\Administrator\.openclaw\extensions\memory-lancedb-pro-v3`

---

## 1. Implemented Modules

| File | Description |
|---|---|
| `dist/dreaming/config.js` | Config normalization: `normalizeDreamingConfig`, `parseDailyCron`, `computeNextDreamingDelayMs`, source alias mapping |
| `dist/dreaming/engine.js` | Three-phase sweep engine: light (dedup/merge + tier transitions), deep (promotion), rem (pattern insight) + setTimeout-based cron scheduling |
| `openclaw.plugin.json` | Added `dreaming` configSchema block (§3.3 compliant, timezone default Asia/Shanghai) |
| `dist/index.js` | Lazy dreaming engine init, zero overhead when disabled, exports |
| `tests/dreaming.test.ts` | 44 test cases (config normalization, cron parsing, delay computation, source aliases, engine creation, light/deep/rem logic, metadata helpers, zero-overhead, scheduling, anti-recursion guard) |
| `scripts/m4-verify.mjs` | Runtime verification script (16 checks) |

---

## 2. vitest Results

```
Test Files  7 passed (7)
     Tests  176 passed (176)
  Duration  4.29s
```

- 44 new dreaming tests + 132 existing tests = 0 regressions

---

## 3. §3.4 Hard Constraint Verification

| # | Constraint | Result | Evidence |
|---|---|---|---|
| 1 | `dreaming.enabled` defaults `false` | ✅ | `enabled=false` in normalized null config |
| 2 | Zero overhead when disabled | ✅ | Disabled sweep returns immediately, no store/embedder calls |
| 3 | No timer when disabled | ✅ | `process._getActiveHandles` delta=0 after start() |
| 4 | Cold start deferred (not in init path) | ✅ | Engine creation elapsed=0ms, no DB access |
| 5 | Sweep paginated (pageSize=100) with yield | ✅ | Code uses `DEFAULT_PAGE_SIZE=100`, `yieldToEventLoop()` between chunks |

---

## 4. §3.5 Acceptance Criteria Verification

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `enabled=false`: zero scheduling | ✅ | No timer created, sweep instant |
| 2 | Cron parsing correct | ✅ | `@daily`→midnight, `0 3 * * *`→3am, non-daily rejected |
| 3 | Next delay computation correct | ✅ | 2AM UTC → next 3AM UTC = ~1.00h delay |
| 4 | Source filter aliases | ✅ | daily→[manual,auto-capture,legacy], deep→phases:[deep] |
| 5 | dreaming-engine source marking | ✅ | In STORED_MEMORY_SOURCES, used in REM output metadata |
| 6 | Enabled engine runs sweep | ✅ | `runSweep()` returns `enabled=true` with phase results |
| 7 | Event loop not blocked during sweep | ✅ | `yieldToEventLoop()` between pages, concurrent timer fires |

---

## 5. M3 Integration Verification

- **Anti-recursion guard**: `dreaming:` prefix is in M2 guard list (`MEMORY_SUBSESSION_PREFIXES` in auto-memory.js) ✅
- **Decay engine reuse**: Light phase calls `decayEngine.score()` and `tierManager.evaluate()` when available (optional dependency) ✅
- **Store serialization**: Dreaming writes go through `store.store()` with `source: "dreaming-engine"` metadata ✅
- **Config isolation**: Dreaming config is separate from reflection config ✅

---

## 6. Test DB

- Source: `C:\Users\Administrator\.openclaw\memory\tmp-m1-test-db` (copied to `tmp-m4-test-db`)
- Production DB (`memory-lancedb-pro-v2`) untouched ✅

---

## 7. Key Design Decisions

1. **setTimeout + unref** instead of external cron: Zero deps, timer doesn't keep process alive, schedule recalculates after each sweep
2. **Lightweight smart-metadata adapter** in engine.js instead of full upstream smart-metadata.ts (25KB): Only `parseSmartMetadata`, `stringifySmartMetadata`, `buildSmartMetadata` — maps to our JSON metadata schema
3. **Decay/Tier manager as optional deps**: Light phase tier transitions only fire if M3's decay engine is provided; gracefully degrades to dedup-only
4. **Empty string frequency → default**: `parseDailyCron("")` falls back to default `0 3 * * *` (matches upstream behavior)

---

## 8. Known Limitations / Future Work

1. **No `fetchForCompaction` store method yet**: Our LanceDB store doesn't expose this upstream method, so light phase vector-based dedup is currently a no-op (falls through to list-based tier transitions only). This needs a future store API extension.
2. **No actual REM insight with LLM**: Current REM phase does pattern counting + text summarization only. Full LLM-based insight generation requires the same `runEmbeddedPiAgent` path as M3's distiller, which is a separate enhancement.
3. **Store adapter in index.js is minimal**: The dreaming store wrapper in `index.js` uses duck-typing checks (`if (db.listEntries)`). A proper store interface will be needed for production use.
