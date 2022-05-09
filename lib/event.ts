import { UnreachableCaseError } from "ts-essentials";

export type SpanId = number;
export type Timestamp = number;

export type Interval = {
  start: Timestamp;
  end: Timestamp;
};

export type Span = {
  name: string;
  interval: Interval;

  parent: Span | null;
  children: Span[];

  scheduled: Interval[];
};

export type Event =
  | {
      type: "SpanStart";
      id: SpanId;
      parent: SpanId | null;
      ts: Timestamp;
      name: string;
    }
  | { type: "Schedule"; id: SpanId; ts: Timestamp }
  | { type: "Deschedule"; id: SpanId; ts: Timestamp }
  | { type: "SpanEnd"; id: SpanId; ts: Timestamp };

export class EventLoader {
  names: Map<string, string>;
  spans: Map<SpanId, Span>;
  root: Span;

  unclosed: Set<Span>;

  constructor() {
    this.names = new Map();
    this.spans = new Map();

    this.root = {
      name: "",
      interval: {
        start: 0,
        end: 0,
      },
      parent: null,
      children: [],
      scheduled: [],
    };
    this.spans.set(-1, this.root);

    this.unclosed = new Set();
  }

  cacheString(s: string): string {
    const cached = this.names.get(s);
    if (!cached) {
      this.names.set(s, s);
      return s;
    }
    return cached;
  }

  maxTs(): number {
    return this.root.interval.end;
  }

  addEvent(event: Event) {
    if (event.ts <= this.maxTs()) {
      throw new Error(
        `Time moved backward from ${this.maxTs()} to ${event.ts}`
      );
    }
    this.root.interval.end = event.ts;

    let span;
    switch (event.type) {
      case "SpanStart":
        if (this.spans.has(event.id)) {
          throw new Error(`Duplicate span ID ${event.id}`);
        }
        let parent;
        if (event.parent) {
          parent = this.spans.get(event.parent);
          if (!parent) {
            throw new Error(`Invalid parent ID ${event.parent}`);
          }
        } else {
          parent = this.root;
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
        };
        span.parent.children.push(span);
        this.spans.set(event.id, span);
        this.unclosed.add(span);
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
        span.scheduled.push({ start: event.ts, end: -1 });
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
        span = this.spans.get(event.id);
        if (!span) {
          throw new Error(`Missing span ID ${event.id}`);
        }
        if (!this.unclosed.has(span)) {
          throw new Error(`Duplicate close on ${event.id}`);
        }
        this.unclosed.delete(span);
        span.interval.end = event.ts;
        return;
      default:
        throw new UnreachableCaseError(event);
    }
  }

  finalize(): Trace {
    // Close all unclosed spans.
    const unclosed = [...this.unclosed.keys()];
    for (const span of unclosed) {
      span.interval.end = this.root.interval.end;
      this.unclosed.delete(span);
    }
    return new Trace([...this.spans.values()], this.root);
  }
}

export class Trace {
  spans: Span[];
  root: Span;

  constructor(spans: Span[], root: Span) {
    this.spans = spans;
    this.root = root;
  }
}
