import { UnreachableCaseError } from "ts-essentials";

export type SpanId = number;
export type Timestamp = number;

export type Interval = {
    start: Timestamp,
    end: Timestamp,
};

export type Span = {
    name: string,
    interval: Interval,

    parent: Span | null,
    children: Span[],

    scheduled: Interval[],
};

type Event =
    | {type: "SpanStart", id: SpanId, parent: SpanId | null, ts: Timestamp, name: string}
    | {type: "Schedule", id: SpanId, ts: Timestamp}
    | {type: "Deschedule", id: SpanId, ts: Timestamp}
    | {type: "SpanEnd", id: SpanId, ts: Timestamp};

export class EventLoader {
    names: Map<string, string>;
    spans: Map<SpanId, Span>;
    roots: Span[];

    maxTs: Timestamp;
    unclosed: Set<SpanId>;

    constructor() {
        this.names = new Map();
        this.spans = new Map();
        this.roots = [];
        this.unclosed = new Set();
        this.maxTs = 0;
    }

    cacheString(s: string): string {
        const cached = this.names.get(s);
        if (!cached) {
            this.names.set(s, s);
            return s;
        }
        return cached;
    }

    addEvent(event: Event) {
        if (event.ts <= this.maxTs) {
            throw new Error(`Time moved backward from ${this.maxTs} to ${event.ts}`);
        }
        this.maxTs = event.ts;

        let span;
        switch (event.type) {
            case "SpanStart":
                if (this.spans.has(event.id)) {
                    throw new Error(`Duplicate span ID ${event.id}`);
                }
                let parent = null;
                if (event.parent) {
                    parent = this.spans.get(event.parent);
                    if (!parent) {
                        throw new Error(`Invalid parent ID ${event.parent}`);
                    }
                }
                span = {
                    parent,
                    children: [],
                    name: this.cacheString(event.name),
                    interval: {
                        start: event.ts,
                        end: -1,
                    },
                    scheduled: [],
                }
                if (span.parent) {
                    span.parent.children.push(span);
                }
                this.spans.set(event.id, span);
                if (!span.parent) {
                    this.roots.push(span);
                }
                this.unclosed.add(event.id);
                return;
            case "Schedule":
                span = this.spans.get(event.id);
                if (!span) {
                    throw new Error(`Missing span ID ${event.id}`);
                }
                if (span.scheduled.length > 0) {
                    const lastInterval = span.scheduled[span.scheduled.length - 1];
                    if (lastInterval.end == -1) {
                        throw new Error(`Duplicate Schedule event for ${event.id}`);
                    }
                }
                span.scheduled.push({start: event.ts, end: -1});
                return;
            case "Deschedule":
                span = this.spans.get(event.id);
                if (!span) {
                    throw new Error(`Missing span ID ${event.id}`);
                }
                if (span.scheduled.length == 0) {
                    throw new Error(`Mismatched Deschedule event for ${event.id}`);
                }
                const lastInterval = span.scheduled[span.scheduled.length - 1];
                if (lastInterval.end !== -1) {
                    throw new Error(`Mismatched Deschedule event for ${event.id}`);
                }
                lastInterval.end = event.ts;
                return;
            case "SpanEnd":
                if (!this.unclosed.has(event.id)) {
                    throw new Error(`Duplicate close on ${event.id}`);
                }
                span = this.spans.get(event.id);
                if (!span) {
                    throw new Error(`Missing span ID ${event.id}`);
                }
                this.unclosed.delete(event.id);
                span.interval.end = event.ts;
                return;
            default:
                throw new UnreachableCaseError(event);
        }
    }

    finalize(): Trace {
        if (this.unclosed.size > 0) {
            throw new Error("Finalizing with unclosed spans");
        }
        // Sort children by start time.
        for (const span of this.spans.values()) {
            span.children.sort((a, b) => a.interval.start - b.interval.start);
        }
        this.roots.sort((a, b) => a.interval.start - b.interval.start);

        return new Trace([...this.spans.values()], this.roots, this.maxTs);
    }
}

export class Trace {
    spans: Span[];
    roots: Span[];
    maxTs: Timestamp;

    constructor(spans: Span[], roots: Span[], maxTs: Timestamp) {
        this.spans = spans;
        this.roots = roots;
        this.maxTs = maxTs;
    }
}
