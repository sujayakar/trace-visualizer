import { Interval, Span, Timestamp, Trace } from "./event";
import { Queue } from "./queue";

type LayoutRect = {
    interval: Interval;
    row: number;
    height: number;
};

function overlaps(a: LayoutRect, b: LayoutRect): boolean {
    const left = a.interval.end < b.interval.start;
    const right = b.interval.end < a.interval.start;
    const up = (a.row + a.height) <= b.row;
    const down = (b.row + b.height) <= a.row;
    return !(left || right || up || down);
}

type LocalLayout = {
    totalHeight: number,
    children: Map<Span, LayoutRect>,
};

function computeLocalLayout(span: Span, layouts: Map<Span, LocalLayout>): LocalLayout {
    // TODO: Keep track of child index here to use below.
    const childrenByEnd = [...span.children];
    childrenByEnd.sort((a, b) => a.interval.end - b.interval.end);

    const layout = {
        totalHeight: 1,
        children: new Map(),
    }
    for (const child of span.children) {
        const childLayout = layouts.get(child);
        if (!childLayout) {
            throw new Error(`Missing child layout for ${child}`);
        }
        // TODO: Use childrenByEnd for binary search here.


    }
    return layout;
}

function computeLocalLayouts(trace: Trace) {
    const childrenRemaining = new Map();
    const leaves = [];
    for (const span of trace.spans) {
        if (span.children.length > 0) {
            childrenRemaining.set(span, span.children.length);
        } else {
            leaves.push(span);
        }

    }
    const layouts = new Map();
    const queue = new Queue(leaves);

    while (queue.length > 0) {
        const span = queue.pop()!;
        const layout = computeLocalLayout(span, layouts);
        if (span.parent) {
            const newRemaining = childrenRemaining.get(span.parent)! - 1;
            childrenRemaining.set(span.parent, newRemaining);
            if (newRemaining === 0) {
                queue.push(span.parent);
            }
        }
        layouts.set(span, layout);
    }
    return layouts;
}
