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
/**
 * Allowed event types (frozen - cannot add new ones).
 */
export type AllowedEventType = 'memory.recall.recorded' | 'memory.promotion.applied';
/**
 * Host event structure.
 */
export interface HostEvent {
    /** Event type (must be one of allowed types) */
    type: AllowedEventType;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Event-specific payload */
    payload: Record<string, unknown>;
    /** Optional source identifier */
    source?: string;
    /** Optional correlation ID */
    correlationId?: string;
}
/**
 * Host events log options.
 */
export interface HostEventsOptions {
    /** Events log directory (required) */
    eventsDir: string;
    /** Events log filename (default: events.jsonl) */
    eventsFilename?: string;
}
/**
 * Host events manager interface.
 */
export interface HostEventsManager {
    /** Append event to log */
    appendEvent(event: HostEvent): Promise<void>;
    /** Read recent events */
    readEvents(options?: ReadEventsOptions): Promise<HostEvent[]>;
    /** Get events log path */
    getLogPath(): string;
    /** Check if events log exists */
    logExists(): boolean;
    /** Get events count */
    getEventsCount(): Promise<number>;
}
/**
 * Read events options.
 */
export interface ReadEventsOptions {
    /** Filter by event type */
    type?: AllowedEventType;
    /** Maximum events to read */
    limit?: number;
    /** Start timestamp (ISO 8601) */
    startTimestamp?: string;
    /** End timestamp (ISO 8601) */
    endTimestamp?: string;
}
/**
 * Validate event type is allowed.
 *
 * @param type - Event type to validate
 * @returns true if allowed, false otherwise
 */
export declare function isValidEventType(type: string): type is AllowedEventType;
/**
 * Create host events manager.
 *
 * Minimal implementation for append/read.
 *
 * @param options - Events options
 * @returns Host events manager
 */
export declare function createHostEventsManager(options: HostEventsOptions): HostEventsManager;
/**
 * Create a recall recorded event.
 *
 * @param payload - Recall event payload
 * @returns Host event
 */
export declare function createRecallRecordedEvent(payload: {
    query?: string;
    resultsCount?: number;
    scope?: string;
    memoryIds?: string[];
}): HostEvent;
/**
 * Create a promotion applied event.
 *
 * @param payload - Promotion event payload
 * @returns Host event
 */
export declare function createPromotionAppliedEvent(payload: {
    memoryId: string;
    scope?: string;
    fromLayer?: string;
    toLayer?: string;
    reason?: string;
}): HostEvent;
/**
 * Export allowed event types for type safety.
 */
export declare const ALLOWED_EVENT_TYPES: AllowedEventType[];
//# sourceMappingURL=host-events.d.ts.map