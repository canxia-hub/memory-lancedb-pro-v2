/**
 * Scope Manager
 *
 * Pure scope validation, normalization, and default value resolution.
 * No host integration - only logic.
 */
/**
 * Default scope when none provided.
 */
export declare const DEFAULT_SCOPE = "default";
/**
 * Scope validation and normalization options.
 */
export interface ScopeOptions {
    /** Raw scope input (may be undefined, empty, or malformed) */
    scope?: string | null;
    /** Override default scope (optional) */
    defaultScope?: string;
}
/**
 * Normalized scope result.
 */
export interface NormalizedScope {
    /** Final normalized scope string */
    scope: string;
    /** Whether the input was undefined/empty and default was used */
    usedDefault: boolean;
    /** Whether the input required normalization (e.g., lowercase conversion) */
    normalized: boolean;
}
/**
 * Validate scope format.
 *
 * @param scope - Scope string to validate
 * @returns true if valid, false otherwise
 */
export declare function isValidScope(scope: string): boolean;
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
export declare function normalizeScope(scope: string | null | undefined, defaultScope?: string): string;
/**
 * Resolve scope with full metadata about resolution process.
 *
 * @param options - Scope options with raw input and optional default override
 * @returns Normalized scope result with metadata
 */
export declare function resolveScope(options: ScopeOptions): NormalizedScope;
/**
 * Build memory path URI.
 *
 * @param scope - Valid scope string
 * @param id - Record identifier
 * @returns URI in format: memory://<scope>/<id>
 */
export declare function buildMemoryPath(scope: string, id: string): string;
/**
 * Parse memory path URI.
 *
 * @param path - URI in format: memory://<scope>/<id>
 * @returns Parsed scope and id, or null if invalid format
 */
export declare function parseMemoryPath(path: string): {
    scope: string;
    id: string;
} | null;
//# sourceMappingURL=scope-manager.d.ts.map