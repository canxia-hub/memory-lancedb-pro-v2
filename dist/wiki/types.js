/**
 * Wiki Type Contract (FROZEN)
 *
 * This file defines the public types for the Wiki subsystem within
 * memory-lancedb-pro-v2. These types MUST NOT be changed without
 * main-thread approval.
 *
 * Source: plans/graphify-integration-plan.md §6
 */
/**
 * Mapping from singular to plural form.
 */
export const CATEGORY_SINGULAR_TO_PLURAL = {
    concept: 'concepts',
    decision: 'decisions',
    procedure: 'procedures',
    reference: 'references',
    snippet: 'snippets',
};
/**
 * All valid category directory names.
 */
export const WIKI_CATEGORIES = [
    'concepts',
    'decisions',
    'procedures',
    'references',
    'snippets',
];
//# sourceMappingURL=types.js.map