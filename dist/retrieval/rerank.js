/**
 * Rerank Layer
 *
 * Supports DashScope text rerank endpoint when configured.
 * Falls back to pass-through on disabled/unavailable/provider errors.
 */
export const RERANK_AVAILABILITY_PHASE1 = {
    hasRerankModule: true,
    hasRerankProvider: false,
    isFunctional: false,
    unavailableReason: 'Rerank provider not configured',
};
const DEFAULT_DASHSCOPE_RERANK_URL = 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank';
function resolveRerankConfig(config = {}) {
    const provider = config.rerankProvider ?? config.provider ?? 'none';
    const model = config.rerankModel ?? config.model ?? 'qwen3-vl-rerank';
    const baseUrl = config.rerankBaseUrl ?? config.baseUrl ?? DEFAULT_DASHSCOPE_RERANK_URL;
    const apiKeyEnv = config.rerankApiKeyEnv ?? config.apiKeyEnv ?? 'DASHSCOPE_API_KEY';
    const apiKey = config.rerankApiKey ?? process.env[apiKeyEnv] ?? process.env.DASHSCOPE_API_KEY;
    return { provider, model, baseUrl, apiKeyEnv, apiKey };
}
function buildAvailability(config = {}) {
    const resolved = resolveRerankConfig(config);
    const enabled = !!config.rerank;
    const provider = String(resolved.provider ?? '').toLowerCase();
    if (!enabled) {
        return {
            hasRerankModule: true,
            hasRerankProvider: false,
            isFunctional: false,
            unavailableReason: 'Rerank disabled by configuration',
        };
    }
    if (provider !== 'dashscope') {
        return {
            hasRerankModule: true,
            hasRerankProvider: false,
            isFunctional: false,
            unavailableReason: `Unsupported rerank provider: ${resolved.provider ?? 'none'}`,
        };
    }
    if (!resolved.apiKey) {
        return {
            hasRerankModule: true,
            hasRerankProvider: true,
            isFunctional: false,
            rerankProvider: 'dashscope',
            rerankModel: resolved.model,
            unavailableReason: `DashScope API key not found in ${resolved.apiKeyEnv}`,
        };
    }
    return {
        hasRerankModule: true,
        hasRerankProvider: true,
        isFunctional: true,
        rerankProvider: 'dashscope',
        rerankModel: resolved.model,
    };
}
async function dashScopeRerank(candidates, options, config) {
    const resolved = resolveRerankConfig(config);
    const documents = candidates.map((candidate) => candidate.content ?? candidate.snippet ?? '');
    const body = {
        model: resolved.model,
        input: {
            query: options.query,
            documents,
        },
        parameters: {
            return_documents: false,
            top_n: Math.min(options.maxCandidates ?? candidates.length, candidates.length),
        },
    };
    const response = await fetch(resolved.baseUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resolved.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        json = { message: text.slice(0, 300) };
    }
    if (!response.ok) {
        throw new Error(`DashScope rerank failed: HTTP ${response.status} ${json.code ?? ''} ${json.message ?? ''}`.trim());
    }
    const results = json.output?.results;
    if (!Array.isArray(results)) {
        throw new Error('DashScope rerank failed: missing output.results');
    }
    const scoreByIndex = new Map();
    for (const result of results) {
        if (typeof result.index === 'number') {
            const score = Number(result.relevance_score ?? result.score ?? 0);
            scoreByIndex.set(result.index, Number.isFinite(score) ? score : 0);
        }
    }
    return candidates
        .map((candidate, index) => {
        const rerankScore = scoreByIndex.get(index) ?? 0;
        return {
            ...candidate,
            rerankScore,
            finalScore: rerankScore,
        };
    })
        .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
}
export function createRerankManager(availability, config = {}) {
    const manager = {
        async rerank(candidates, options) {
            const startTime = Date.now();
            if (!options.enabled) {
                return {
                    candidates,
                    rerankApplied: false,
                    rerankCount: 0,
                    durationMs: Date.now() - startTime,
                    skipReason: 'Rerank disabled by configuration',
                };
            }
            if (!availability.isFunctional) {
                return {
                    candidates,
                    rerankApplied: false,
                    rerankCount: 0,
                    durationMs: Date.now() - startTime,
                    skipReason: availability.unavailableReason,
                };
            }
            try {
                const reranked = await dashScopeRerank(candidates, options, config);
                return {
                    candidates: reranked,
                    rerankApplied: true,
                    rerankCount: reranked.length,
                    durationMs: Date.now() - startTime,
                    modelUsed: availability.rerankModel,
                };
            }
            catch (error) {
                return {
                    candidates,
                    rerankApplied: false,
                    rerankCount: 0,
                    durationMs: Date.now() - startTime,
                    modelUsed: availability.rerankModel,
                    skipReason: error instanceof Error ? error.message : String(error),
                };
            }
        },
        async checkAvailability() {
            return availability;
        },
    };
    return manager;
}
export function createDefaultRerankManager(config = {}) {
    const availability = buildAvailability(config);
    return createRerankManager(availability, config);
}
//# sourceMappingURL=rerank.js.map
