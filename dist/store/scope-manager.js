/**
 * Scope Manager
 *
 * Pure scope validation, normalization, and default value resolution.
 * No host integration - only logic.
 */
/**
 * Valid scope format: alphanumeric with hyphens/underscores, lowercase.
 * Examples: 'default', 'agent-main', 'my_scope'
 */
const SCOPE_PATTERN = /^[a-z][a-z0-9_-]*$/;
/**
 * Default scope when none provided.
 */
export const DEFAULT_SCOPE = 'default';
/**
 * Validate scope format.
 *
 * @param scope - Scope string to validate
 * @returns true if valid, false otherwise
 */
export function isValidScope(scope) {
    if (!scope || typeof scope !== 'string') {
        return false;
    }
    return SCOPE_PATTERN.test(scope);
}
/**
 * Normalize scope to valid format.
 *
 * - Converts to lowercase
 * - Trims whitespace
 * - Replaces spaces with hyphens
 * - Returns default if result is empty
 *
 * @param scope - Raw scope input
 * @param defaultScope - Override default (optional)
 * @returns Normalized scope string
 */
export function normalizeScope(scope, defaultScope) {
    const fallback = defaultScope ?? DEFAULT_SCOPE;
    if (!scope || typeof scope !== 'string') {
        return fallback;
    }
    // Normalize: lowercase, trim, replace spaces with hyphens
    const normalized = scope
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-');
    if (normalized === '') {
        return fallback;
    }
    // If still invalid pattern, use default
    if (!isValidScope(normalized)) {
        return fallback;
    }
    return normalized;
}
/**
 * Resolve scope with full metadata about resolution process.
 *
 * @param options - Scope options with raw input and optional default override
 * @returns Normalized scope result with metadata
 */
export function resolveScope(options) {
    const fallback = options.defaultScope ?? DEFAULT_SCOPE;
    const rawScope = options.scope;
    if (!rawScope || typeof rawScope !== 'string' || rawScope.trim() === '') {
        return {
            scope: fallback,
            usedDefault: true,
            normalized: false,
        };
    }
    const normalized = normalizeScope(rawScope, fallback);
    const wasNormalized = normalized !== rawScope;
    return {
        scope: normalized,
        usedDefault: normalized === fallback,
        normalized: wasNormalized,
    };
}
/**
 * Build memory path URI.
 *
 * @param scope - Valid scope string
 * @param id - Record identifier
 * @returns URI in format: memory://<scope>/<id>
 */
export function buildMemoryPath(scope, id) {
    const validScope = isValidScope(scope) ? scope : DEFAULT_SCOPE;
    return `memory://${validScope}/${id}`;
}
/**
 * Parse memory path URI.
 *
 * @param path - URI in format: memory://<scope>/<id>
 * @returns Parsed scope and id, or null if invalid format
 */
export function parseMemoryPath(path) {
    if (!path || typeof path !== 'string') {
        return null;
    }
    const match = path.match(/^memory:\/\/([^/]+)\/(.+)$/);
    if (!match) {
        return null;
    }
    const scope = match[1];
    const id = match[2];
    if (!isValidScope(scope) || !id) {
        return null;
    }
    return { scope, id };
}
//# sourceMappingURL=scope-manager.js.map