/**
 * Reflection Retry — Transient error classification and single-retry with jitter.
 *
 * Ported from upstream reflection-retry.ts.
 * Classifies errors as transient (retryable once) or permanent (fail immediately).
 */

// ── Transient Error Patterns ───────────────────────────────────────────

const REFLECTION_TRANSIENT_PATTERNS = [
  /unexpected eof/i,
  /\beconnreset\b/i,
  /\beconnaborted\b/i,
  /\betimedout\b/i,
  /\bepipe\b/i,
  /connection reset/i,
  /socket hang up/i,
  /socket (?:closed|disconnected)/i,
  /connection (?:closed|aborted|dropped)/i,
  /early close/i,
  /stream (?:ended|closed) unexpectedly/i,
  /temporar(?:y|ily).*unavailable/i,
  /upstream.*unavailable/i,
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i,
  /\b(?:http|status)\s*(?:502|503|504)\b/i,
  /\btimed out\b/i,
  /\btimeout\b/i,
  /request was aborted/i,
  /\baborterror\b/i,
  /\bund_err_(?:socket|headers_timeout|body_timeout)\b/i,
  /network error/i,
  /fetch failed/i,
];

const REFLECTION_NON_RETRY_PATTERNS = [
  /\b401\b/i,
  /\bunauthorized\b/i,
  /invalid api key/i,
  /invalid[_ -]?token/i,
  /\bauth(?:entication)?_?unavailable\b/i,
  /insufficient (?:credit|credits|balance)/i,
  /\bbilling\b/i,
  /\bquota exceeded\b/i,
  /payment required/i,
  /model .*not found/i,
  /no such model/i,
  /unknown model/i,
  /context length/i,
  /context window/i,
  /request too large/i,
  /payload too large/i,
  /too many tokens/i,
  /token limit/i,
  /prompt too long/i,
  /session expired/i,
  /invalid session/i,
  /refusal/i,
  /content policy/i,
  /safety policy/i,
  /content filter/i,
  /disallowed/i,
];

// ── Helpers ────────────────────────────────────────────────────────────

function toErrorMessage(error) {
  if (error instanceof Error) {
    const msg = `${error.name}: ${error.message}`.trim();
    return msg || 'Error';
  }
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function clipSingleLine(text, maxLen = 260) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 3)}...`;
}

// ── Classification ─────────────────────────────────────────────────────

/**
 * Check if an error is a transient upstream failure (retryable).
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientReflectionUpstreamError(error) {
  const msg = toErrorMessage(error);
  return REFLECTION_TRANSIENT_PATTERNS.some((pattern) => pattern.test(msg));
}

/**
 * Check if an error is a non-retryable error (auth, billing, policy, etc.).
 * @param {unknown} error
 * @returns {boolean}
 */
export function isReflectionNonRetryError(error) {
  const msg = toErrorMessage(error);
  return REFLECTION_NON_RETRY_PATTERNS.some((pattern) => pattern.test(msg));
}

/**
 * Classify whether a reflection error should be retried.
 * @param {Object} input
 * @param {boolean} input.inReflectionScope
 * @param {number} input.retryCount
 * @param {number} input.usefulOutputChars
 * @param {unknown} input.error
 * @returns {{retryable: boolean, reason: string, normalizedError: string}}
 */
export function classifyReflectionRetry(input) {
  const normalizedError = clipSingleLine(toErrorMessage(input.error), 260);

  if (!input.inReflectionScope) {
    return { retryable: false, reason: 'not_reflection_scope', normalizedError };
  }
  if (input.retryCount > 0) {
    return { retryable: false, reason: 'retry_already_used', normalizedError };
  }
  if (input.usefulOutputChars > 0) {
    return { retryable: false, reason: 'useful_output_present', normalizedError };
  }
  if (isReflectionNonRetryError(input.error)) {
    return { retryable: false, reason: 'non_retry_error', normalizedError };
  }
  if (isTransientReflectionUpstreamError(input.error)) {
    return { retryable: true, reason: 'transient_upstream_failure', normalizedError };
  }
  return { retryable: false, reason: 'non_transient_error', normalizedError };
}

/**
 * Compute retry delay with jitter (1-3 seconds).
 * @param {() => number} [random=Math.random]
 * @returns {number} Delay in milliseconds
 */
export function computeReflectionRetryDelayMs(random = Math.random) {
  const raw = random();
  const clamped = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  return 1000 + Math.floor(clamped * 2000);
}

const DEFAULT_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run an async operation with single-retry on transient failure.
 *
 * @param {Object} params
 * @param {"reflection"|"distiller"} params.scope
 * @param {string} params.runner
 * @param {{count: number}} params.retryState
 * @param {() => Promise<T>} params.execute
 * @param {(level: "info"|"warn", message: string) => void} [params.onLog]
 * @param {() => number} [params.random]
 * @param {(ms: number) => Promise<void>} [params.sleep]
 * @returns {Promise<T>}
 * @template T
 */
export async function runWithReflectionTransientRetryOnce(params) {
  try {
    return await params.execute();
  } catch (error) {
    const decision = classifyReflectionRetry({
      inReflectionScope: params.scope === 'reflection' || params.scope === 'distiller',
      retryCount: params.retryState.count,
      usefulOutputChars: 0,
      error,
    });
    if (!decision.retryable) throw error;

    const delayMs = computeReflectionRetryDelayMs(params.random);
    params.retryState.count += 1;
    params.onLog?.(
      'warn',
      `memory-${params.scope}: transient upstream failure detected (${params.runner}); ` +
      `retrying once in ${delayMs}ms (${decision.reason}). error=${decision.normalizedError}`,
    );
    await (params.sleep ?? DEFAULT_SLEEP)(delayMs);

    try {
      const result = await params.execute();
      params.onLog?.('info', `memory-${params.scope}: retry succeeded (${params.runner})`);
      return result;
    } catch (retryError) {
      params.onLog?.(
        'warn',
        `memory-${params.scope}: retry exhausted (${params.runner}). ` +
        `error=${clipSingleLine(toErrorMessage(retryError), 260)}`,
      );
      throw retryError;
    }
  }
}

/**
 * Retry-once wrapper for reflection-lane embedding calls.
 * Each embed call carries its own single-retry budget.
 *
 * @param {(text: string) => Promise<number[]>} embed
 * @param {string} text
 * @param {string} runner
 * @param {(level: "info"|"warn", message: string) => void} [onLog]
 * @param {(ms: number) => Promise<void>} [sleep]
 * @returns {Promise<number[]>}
 */
export async function embedWithReflectionTransientRetry(embed, text, runner, onLog, sleep) {
  return runWithReflectionTransientRetryOnce({
    scope: 'reflection',
    runner,
    retryState: { count: 0 },
    onLog,
    sleep,
    execute: () => embed(text),
  });
}
