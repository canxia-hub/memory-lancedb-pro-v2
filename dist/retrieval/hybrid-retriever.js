/**
 * Hybrid Retriever - Internal Retrieval Skeleton
 *
 * Phase 1 skeleton provides:
 * - Internal retrieval candidate structure (richer than public MemorySearchResult)
 * - Lexical search dispatch
 * - Vector search placeholder (requires embedding availability)
 * - Hybrid combination logic
 *
 * Internal candidates must be mapped to public MemorySearchResult before export.
 */
import { buildMemoryPath } from '../store/scope-manager.js';
/**
 * Simple lexical search implementation.
 *
 * Phase 1 uses basic text matching (not full BM25).
 * Will be enhanced when proper BM25 implementation is available.
 *
 * @param query - Search query
 * @param records - Memory records to search
 * @param options - Search options
 * @returns Matching candidates with lexical scores
 */
export function simpleLexicalSearch(query, records, options) {
    if (!query || query.trim() === '') {
        return [];
    }
    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
    const limit = options?.limit ?? 20;
    const minScore = options?.minScore ?? 0.1;
    // Calculate lexical scores for each record
    const candidates = records.map(record => {
        const contentLower = record.content.toLowerCase();
        // Simple term frequency scoring
        let termMatches = 0;
        let exactMatchBonus = 0;
        for (const term of queryTerms) {
            const termCount = (contentLower.match(new RegExp(term, 'g')) ?? []).length;
            termMatches += termCount;
            // Bonus for exact phrase match
            if (contentLower.includes(normalizedQuery)) {
                exactMatchBonus = 0.2;
            }
        }
        // Normalize score to 0-1 range
        const baseScore = Math.min(1, termMatches / (queryTerms.length * 3));
        const lexicalScore = Math.min(1, baseScore + exactMatchBonus);
        // Build snippet (truncate to reasonable length)
        const snippet = truncateSnippet(record.content, 180);
        return {
            id: record.id,
            scope: record.scope,
            path: buildMemoryPath(record.scope, record.id),
            lexicalScore,
            finalScore: lexicalScore,
            snippet,
            content: record.content,
            category: record.category,
            importance: record.importance,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            metadata: record.metadata,
        };
    });
    // Filter, sort, and limit
    return candidates
        .filter(c => c.lexicalScore >= minScore)
        .sort((a, b) => b.lexicalScore - a.lexicalScore)
        .slice(0, limit);
}
/**
 * Truncate content to snippet.
 *
 * @param content - Full content
 * @param maxLength - Maximum snippet length
 * @returns Truncated snippet
 */
export function truncateSnippet(content, maxLength = 180) {
    if (!content || content.length <= maxLength) {
        return content ?? '';
    }
    // Find a good break point near maxLength
    const breakPoint = content.lastIndexOf(' ', maxLength);
    if (breakPoint > maxLength * 0.7) {
        return content.substring(0, breakPoint) + '...';
    }
    return content.substring(0, maxLength) + '...';
}
/**
 * Create hybrid retriever instance.
 *
 * Phase 1 skeleton:
 * - Lexical search is available (simple implementation)
 * - Vector search is placeholder (requires embedding provider)
 * - Hybrid is available but vector path will return empty
 *
 * @param records - Memory records (from store)
 * @param availability - Retrieval availability status
 * @returns Hybrid retriever instance
 */
export function createHybridRetriever(records, availability) {
    const retriever = {
        async retrieve(options) {
            switch (options.mode) {
                case 'lexical':
                    return this.lexicalSearch(options.query, options);
                case 'vector':
                    return this.vectorSearch(options.query, options);
                case 'hybrid': {
                    const lexicalResults = await this.lexicalSearch(options.query, options);
                    const vectorResults = await this.vectorSearch(options.query, options);
                    // If vector retrieval is unavailable or not yet implemented, do not
                    // penalize lexical matches by forcing them through a half-weight hybrid path.
                    if (vectorResults.length === 0) {
                        return lexicalResults;
                    }
                    return this.combineResults(lexicalResults, vectorResults, {
                        lexicalWeight: options.lexicalWeight,
                        vectorWeight: options.vectorWeight,
                    });
                }
                default:
                    return this.lexicalSearch(options.query, options);
            }
        },
        async checkAvailability() {
            return availability;
        },
        async lexicalSearch(query, options) {
            // Apply scope/category filters
            let filteredRecords = records;
            if (options?.scope) {
                filteredRecords = filteredRecords.filter(r => r.scope === options.scope);
            }
            if (options?.category) {
                filteredRecords = filteredRecords.filter(r => r.category === options.category);
            }
            return simpleLexicalSearch(query, filteredRecords, options);
        },
        async vectorSearch(query, options) {
            // Phase 1 placeholder: vector search requires embedding
            // Honest: return empty when embedding not available
            if (!availability.vectorAvailable) {
                // Vector search unavailable - return empty, not fake results
                return [];
            }
            // When vector search is implemented:
            // 1. Get embedding for query
            // 2. Search LanceDB with vector
            // 3. Return candidates with vectorScore
            // Placeholder: return empty (honest about unavailability)
            return [];
        },
        combineResults(lexical, vector, options) {
            const lexicalWeight = options?.lexicalWeight ?? 0.5;
            const vectorWeight = options?.vectorWeight ?? 0.5;
            // Create map for deduplication by path
            const candidateMap = new Map();
            // Add lexical results
            for (const c of lexical) {
                candidateMap.set(c.path, {
                    ...c,
                    lexicalScore: c.lexicalScore,
                    hybridScore: c.lexicalScore * lexicalWeight,
                    finalScore: c.lexicalScore * lexicalWeight,
                });
            }
            // Add/merge vector results
            for (const c of vector) {
                const existing = candidateMap.get(c.path);
                if (existing) {
                    // Merge scores
                    existing.vectorScore = c.vectorScore;
                    existing.hybridScore = (existing.lexicalScore ?? 0) * lexicalWeight + (c.vectorScore ?? 0) * vectorWeight;
                    existing.finalScore = existing.hybridScore;
                }
                else {
                    // New candidate from vector only
                    candidateMap.set(c.path, {
                        ...c,
                        vectorScore: c.vectorScore,
                        hybridScore: (c.vectorScore ?? 0) * vectorWeight,
                        finalScore: (c.vectorScore ?? 0) * vectorWeight,
                    });
                }
            }
            // Sort by final score and return
            return Array.from(candidateMap.values())
                .sort((a, b) => b.finalScore - a.finalScore);
        },
    };
    return retriever;
}
//# sourceMappingURL=hybrid-retriever.js.map