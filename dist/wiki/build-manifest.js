/**
 * Build Manifest — P2 增量构建文件指纹追踪
 *
 * 维护 .openclaw-wiki/cache/build-manifest.json，记录每个 wiki 文件的
 * mtime + contentHash，用于增量构建时的变更检测。
 *
 * 变更分类：added / modified / deleted / unchanged
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

// ============================================================================
// Constants
// ============================================================================

const MANIFEST_REL = '.openclaw-wiki/cache/build-manifest.json';

// Directories to skip during vault scanning (same as digest-compiler)
const SKIP_DIRS = new Set([
    '.openclaw-wiki', 'graphify-out', 'legacy', 'memory-vaults',
    'archive', 'templates', 'node_modules', '.git', '__pycache__',
]);

// ============================================================================
// Manifest I/O
// ============================================================================

/**
 * Get manifest file path for a vault.
 */
function manifestPath(vaultPath) {
    return path.join(vaultPath, MANIFEST_REL);
}

/**
 * Load build manifest from disk.
 * Returns null if not found or invalid.
 *
 * @param {string} vaultPath - Wiki vault root
 * @returns {{ lastBuildAt: string, buildType: string, files: Record<string, {mtime: string, contentHash: string, size: number}> } | null}
 */
export function loadManifest(vaultPath) {
    const mp = manifestPath(vaultPath);
    if (!fs.existsSync(mp)) return null;
    try {
        const raw = fs.readFileSync(mp, 'utf8');
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object' || !data.files) return null;
        return data;
    } catch {
        return null;
    }
}

/**
 * Save build manifest to disk.
 *
 * @param {string} vaultPath - Wiki vault root
 * @param {object} manifest - Manifest data
 */
export function saveManifest(vaultPath, manifest) {
    const mp = manifestPath(vaultPath);
    const dir = path.dirname(mp);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(mp, JSON.stringify(manifest, null, 2), 'utf8');
}

// ============================================================================
// File Fingerprinting
// ============================================================================

/**
 * Compute content hash for a file.
 */
function fileContentHash(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Scan vault and compute fingerprints for all .md files.
 *
 * @param {string} vaultPath - Wiki vault root
 * @returns {Record<string, {mtime: string, contentHash: string, size: number}>}
 */
export function scanVaultFingerprints(vaultPath) {
    const fingerprints = {};
    if (!fs.existsSync(vaultPath)) return fingerprints;

    function scanDir(dirPath, prefix) {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relPath = prefix ? path.join(prefix, entry.name).replace(/\\/g, '/') : entry.name;
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                    scanDir(fullPath, relPath);
                }
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
                try {
                    const stat = fs.statSync(fullPath);
                    fingerprints[relPath] = {
                        mtime: stat.mtime.toISOString(),
                        contentHash: fileContentHash(fullPath),
                        size: stat.size,
                    };
                } catch { /* skip unreadable files */ }
            }
        }
    }

    const topEntries = fs.readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of topEntries) {
        if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            scanDir(path.join(vaultPath, entry.name), entry.name);
        }
    }
    return fingerprints;
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Detect changes between old manifest and current vault state.
 *
 * @param {string} vaultPath - Wiki vault root
 * @returns {{ added: string[], modified: string[], deleted: string[], unchanged: string[], current: Record<string, object>, hasChanges: boolean }}
 */
export function detectChanges(vaultPath) {
    const oldManifest = loadManifest(vaultPath);
    const currentFingerprints = scanVaultFingerprints(vaultPath);

    const added = [];
    const modified = [];
    const unchanged = [];
    const deleted = [];

    // If no old manifest, everything is "added" (first build)
    if (!oldManifest) {
        return {
            added: Object.keys(currentFingerprints),
            modified: [],
            deleted: [],
            unchanged: [],
            current: currentFingerprints,
            hasChanges: Object.keys(currentFingerprints).length > 0,
        };
    }

    const oldFiles = oldManifest.files || {};

    // Detect added and modified
    for (const [relPath, fp] of Object.entries(currentFingerprints)) {
        const oldFp = oldFiles[relPath];
        if (!oldFp) {
            added.push(relPath);
        } else if (oldFp.contentHash !== fp.contentHash) {
            modified.push(relPath);
        } else {
            unchanged.push(relPath);
        }
    }

    // Detect deleted
    for (const relPath of Object.keys(oldFiles)) {
        if (!currentFingerprints[relPath]) {
            deleted.push(relPath);
        }
    }

    return {
        added,
        modified,
        deleted,
        unchanged,
        current: currentFingerprints,
        hasChanges: added.length > 0 || modified.length > 0 || deleted.length > 0,
    };
}

/**
 * Build and save a new manifest from current vault state.
 *
 * @param {string} vaultPath - Wiki vault root
 * @param {string} buildType - 'full' or 'incremental'
 * @returns {object} The saved manifest
 */
export function buildAndSaveManifest(vaultPath, buildType = 'full') {
    const fingerprints = scanVaultFingerprints(vaultPath);
    const manifest = {
        lastBuildAt: new Date().toISOString(),
        buildType,
        files: fingerprints,
    };
    saveManifest(vaultPath, manifest);
    return manifest;
}
