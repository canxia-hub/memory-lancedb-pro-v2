/**
 * Plugin State Persistence — Phase 3 (TypeScript source)
 *
 * Wraps OpenClaw's openKeyedStore (SQLite-backed) for durable plugin metadata.
 * Runtime implementation in dist/state/plugin-state.js.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

/** Simplified openKeyedStore interface (matches SDK internal type). */
export interface KeyedStore<T> {
  register(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  registerIfAbsent(key: string, value: T, opts?: { ttlMs?: number }): Promise<boolean>;
  lookup(key: string): Promise<T | undefined>;
  consume(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<{ key: string; value: T; createdAt: number; expiresAt?: number }>>;
  clear(): Promise<void>;
}

interface MigrationEntry { version: number; timestamp: number; }
interface StatsEntry { dbPath: string; tableName: string; connectionMode: string; embeddingDimension: number; registeredAt: number; updatedAt?: number; }

export async function initPluginState(api: OpenClawPluginApi): Promise<boolean> {
  try {
    await api.runtime.state.openKeyedStore({ namespace: "memory-lancedb-pro", maxEntries: 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function getLastMigration(store: KeyedStore<MigrationEntry>) {
  return store.lookup("migration:lastVersion");
}

export async function setLastMigration(store: KeyedStore<MigrationEntry>, version: number) {
  await store.register("migration:lastVersion", { version, timestamp: Date.now() });
}

export async function getStats(store: KeyedStore<StatsEntry>) {
  return store.lookup("stats");
}

export async function setStats(store: KeyedStore<StatsEntry>, stats: Omit<StatsEntry, "updatedAt">) {
  await store.register("stats", { ...stats, updatedAt: Date.now() });
}

export async function cacheSearch(store: KeyedStore<unknown>, cacheKey: string, result: unknown, ttlMs = 300000) {
  await store.register(`search:${cacheKey}`, result, { ttlMs });
}

export async function getSearchCache(store: KeyedStore<unknown>, cacheKey: string) {
  return store.lookup(`search:${cacheKey}`);
}
