/**
 * Reflection Event Store — Build event payloads and generate event IDs.
 *
 * Ported from upstream reflection-event-store.ts.
 * Schema v4 with SHA1-based deterministic event IDs.
 */

import { createHash } from 'node:crypto';

export const REFLECTION_SCHEMA_VERSION = 4;

/**
 * Create a deterministic reflection event ID.
 * @param {Object} params
 * @param {number} params.runAt
 * @param {string} params.sessionKey
 * @param {string} params.sessionId
 * @param {string} params.agentId
 * @param {string} params.command
 * @returns {string}
 */
export function createReflectionEventId(params) {
  const safeRunAt = Number.isFinite(params.runAt) ? Math.max(0, Math.floor(params.runAt)) : Date.now();
  const datePart = new Date(safeRunAt).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const digest = createHash('sha1')
    .update(`${safeRunAt}|${params.sessionKey}|${params.sessionId}|${params.agentId}|${params.command}`)
    .digest('hex')
    .slice(0, 8);
  return `refl-${datePart}-${digest}`;
}

/**
 * Build a reflection event payload.
 *
 * @param {Object} params
 * @param {string} [params.eventId]
 * @param {string} params.scope
 * @param {string} params.sessionKey
 * @param {string} params.sessionId
 * @param {string} params.agentId
 * @param {string} params.command
 * @param {Array<{signatureHash: string}>} params.toolErrorSignals
 * @param {number} params.runAt
 * @param {boolean} params.usedFallback
 * @param {string} [params.sourceReflectionPath]
 * @returns {{kind: "event", text: string, metadata: object}}
 */
export function buildReflectionEventPayload(params) {
  const eventId = params.eventId || createReflectionEventId({
    runAt: params.runAt,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
    command: params.command,
  });

  const metadata = {
    type: 'memory-reflection-event',
    reflectionVersion: REFLECTION_SCHEMA_VERSION,
    stage: 'reflect-store',
    eventId,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
    command: params.command,
    storedAt: params.runAt,
    usedFallback: params.usedFallback,
    errorSignals: params.toolErrorSignals.map((signal) => signal.signatureHash),
  };

  if (params.sourceReflectionPath) {
    metadata.sourceReflectionPath = params.sourceReflectionPath;
  }

  // Event text: structured summary (session key/id NOT in indexable text per #954)
  const text = [
    `reflection-event · ${params.scope}`,
    `eventId=${eventId}`,
    `session=${params.sessionId}`,
    `agent=${params.agentId}`,
    `command=${params.command}`,
    `usedFallback=${params.usedFallback ? 'true' : 'false'}`,
  ].join('\n');

  return {
    kind: 'event',
    text,
    metadata,
  };
}
