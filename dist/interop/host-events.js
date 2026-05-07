/**
 * Host Events Emission
 *
 * Phase 3 minimal implementation.
 * Provides minimal append/read for host events.
 *
 * Only supports these event types (no new event names):
 * - memory.recall.recorded
 * - memory.promotion.applied
 *
 * NOTE: Cannot invent new event types beyond these two.
 */
import * as fs from 'fs';
import * as path from 'path';
/**
 * Validate event type is allowed.
 *
 * @param type - Event type to validate
 * @returns true if allowed, false otherwise
 */
export function isValidEventType(type) {
    const allowedTypes = [
        'memory.recall.recorded',
        'memory.promotion.applied',
    ];
    return allowedTypes.includes(type);
}
/**
 * Create host events manager.
 *
 * Minimal implementation for append/read.
 *
 * @param options - Events options
 * @returns Host events manager
 */
export function createHostEventsManager(options) {
    const eventsDir = options.eventsDir;
    const eventsFilename = options.eventsFilename ?? 'events.jsonl';
    const logPath = path.join(eventsDir, eventsFilename);
    // Ensure directory exists
    function ensureEventsDir() {
        if (!fs.existsSync(eventsDir)) {
            fs.mkdirSync(eventsDir, { recursive: true });
        }
    }
    const manager = {
        async appendEvent(event) {
            // Validate event type (must be allowed)
            if (!isValidEventType(event.type)) {
                throw new Error(`Invalid event type: ${event.type}. Allowed types: memory.recall.recorded, memory.promotion.applied`);
            }
            ensureEventsDir();
            // Format event as JSON line
            const eventLine = JSON.stringify({
                type: event.type,
                timestamp: event.timestamp ?? new Date().toISOString(),
                payload: event.payload ?? {},
                source: event.source,
                correlationId: event.correlationId,
            }) + '\n';
            // Append to log
            try {
                fs.appendFileSync(logPath, eventLine, 'utf-8');
            }
            catch (error) {
                throw new Error(`Failed to append event to ${logPath}: ${error}`);
            }
        },
        async readEvents(options) {
            if (!fs.existsSync(logPath)) {
                return [];
            }
            try {
                const content = fs.readFileSync(logPath, 'utf-8');
                const lines = content.trim().split('\n');
                let events = lines.map(line => {
                    try {
                        return JSON.parse(line);
                    }
                    catch {
                        // Skip malformed lines
                        return null;
                    }
                }).filter((e) => e !== null);
                // Apply filters
                if (options?.type) {
                    events = events.filter(e => e.type === options.type);
                }
                if (options?.startTimestamp) {
                    const startTime = new Date(options.startTimestamp).getTime();
                    events = events.filter(e => new Date(e.timestamp).getTime() >= startTime);
                }
                if (options?.endTimestamp) {
                    const endTime = new Date(options.endTimestamp).getTime();
                    events = events.filter(e => new Date(e.timestamp).getTime() <= endTime);
                }
                // Apply limit (most recent first)
                if (options?.limit) {
                    events = events.reverse().slice(0, options.limit).reverse();
                }
                return events;
            }
            catch (error) {
                return [];
            }
        },
        getLogPath() {
            return logPath;
        },
        logExists() {
            return fs.existsSync(logPath);
        },
        async getEventsCount() {
            if (!fs.existsSync(logPath)) {
                return 0;
            }
            try {
                const content = fs.readFileSync(logPath, 'utf-8');
                return content.trim().split('\n').filter(l => l.trim() !== '').length;
            }
            catch {
                return 0;
            }
        },
    };
    return manager;
}
/**
 * Create a recall recorded event.
 *
 * @param payload - Recall event payload
 * @returns Host event
 */
export function createRecallRecordedEvent(payload) {
    return {
        type: 'memory.recall.recorded',
        timestamp: new Date().toISOString(),
        payload: {
            query: payload.query,
            resultsCount: payload.resultsCount ?? 0,
            scope: payload.scope,
            memoryIds: payload.memoryIds ?? [],
        },
        source: 'memory-lancedb-pro-v2',
    };
}
/**
 * Create a promotion applied event.
 *
 * @param payload - Promotion event payload
 * @returns Host event
 */
export function createPromotionAppliedEvent(payload) {
    return {
        type: 'memory.promotion.applied',
        timestamp: new Date().toISOString(),
        payload: {
            memoryId: payload.memoryId,
            scope: payload.scope,
            fromLayer: payload.fromLayer ?? 'working',
            toLayer: payload.toLayer ?? 'durable',
            reason: payload.reason,
        },
        source: 'memory-lancedb-pro-v2',
    };
}
/**
 * Export allowed event types for type safety.
 */
export const ALLOWED_EVENT_TYPES = [
    'memory.recall.recorded',
    'memory.promotion.applied',
];
//# sourceMappingURL=host-events.js.map