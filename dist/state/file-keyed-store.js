/**
 * File-based fallback keyed store for plugin state persistence.
 * Used when OpenClaw's openKeyedStore is unavailable (restricted to
 * trusted/bundled plugins in this release).
 *
 * API-compatible subset of PluginStateKeyedStore:
 *   register(key, value, opts?) / registerIfAbsent(key, value, opts?)
 *   lookup(key) / consume(key) / delete(key) / entries() / clear()
 *
 * Persistence: single JSON file at <stateDir>/<namespace>.json,
 * written atomically (tmp + rename). TTL expiry is evaluated on read.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} stateDir Directory for the backing file.
 * @param {string} namespace Store namespace (file basename).
 * @param {{maxEntries?: number}} [options]
 */
export function createFileKeyedStore(stateDir, namespace, options = {}) {
  const maxEntries = options.maxEntries ?? 1000;
  const filePath = path.join(stateDir, `${namespace.replace(/[^a-zA-Z0-9._-]/g, '_')}.plugin-state.json`);
  const tmpPath = `${filePath}.tmp`;

  /** @type {Record<string, {value: unknown, ttlMs?: number, expiresAt?: number, createdAt: number}>} */
  let cache = null;

  const load = () => {
    if (cache) return cache;
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          cache = parsed.entries ?? {};
          return cache;
        }
      }
    } catch {
      // Corrupt store: start fresh rather than crash the plugin.
    }
    cache = {};
    return cache;
  };

  const persist = () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify({ namespace, version: 1, entries: cache ?? {} }), 'utf8');
    fs.renameSync(tmpPath, filePath);
  };

  const isExpired = (entry) => Number.isFinite(entry.expiresAt) && entry.expiresAt <= Date.now();

  const write = (key, value, opts = {}) => {
    load();
    const ttlMs = typeof opts.ttlMs === 'number' && opts.ttlMs > 0 ? opts.ttlMs : undefined;
    const entry = {
      value,
      ttlMs,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
      createdAt: Date.now(),
    };
    cache[key] = entry;
    // Evict oldest entries when over capacity (FIFO by createdAt).
    const keys = Object.keys(cache);
    if (keys.length > maxEntries) {
      const ranked = keys
        .map((k) => [k, cache[k]?.createdAt ?? 0])
        .sort((a, b) => a[1] - b[1])
        .map(([k]) => k);
      while (ranked.length && Object.keys(cache).length > maxEntries) {
        delete cache[ranked.shift()];
      }
    }
    persist();
  };

  return {
    async register(key, value, opts) {
      write(key, value, opts);
    },
    async registerIfAbsent(key, value, opts) {
      load();
      const existing = cache[key];
      if (existing && !isExpired(existing)) return false;
      write(key, value, opts);
      return true;
    },
    async lookup(key) {
      load();
      const entry = cache[key];
      if (!entry) return undefined;
      if (isExpired(entry)) {
        delete cache[key];
        persist();
        return undefined;
      }
      return entry.value;
    },
    async consume(key) {
      load();
      const entry = cache[key];
      if (!entry || isExpired(entry)) {
        if (entry) {
          delete cache[key];
          persist();
        }
        return undefined;
      }
      delete cache[key];
      persist();
      return entry.value;
    },
    async delete(key) {
      load();
      if (!(key in cache)) return false;
      delete cache[key];
      persist();
      return true;
    },
    async entries() {
      load();
      const now = Date.now();
      return Object.entries(cache)
        .filter(([, e]) => !(Number.isFinite(e.expiresAt) && e.expiresAt <= now))
        .map(([key, e]) => ({ key, value: e.value, createdAt: e.createdAt, ttlMs: e.ttlMs }));
    },
    async clear() {
      cache = {};
      persist();
    },
  };
}
