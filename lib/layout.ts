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
  const up = a.row + a.height <= b.row;
  const down = b.row + b.height <= a.row;
  return !(left || right || up || down);
}

type LocalLayout = {
  totalHeight: number;
  children: Map<Span, LayoutRect>;
};

function computeLocalLayout(
  span: Span,
  layouts: Map<Span, LocalLayout>
): LocalLayout {
  const layout = {
    totalHeight: 1,
    children: new Map(),
  };

  // Sort all children by start time.
  span.children.sort((a, b) => a.interval.start - b.interval.start);

  for (let i = 0; i < span.children.length; i++) {
    const child = span.children[i];
    const childLayout = layouts.get(child);
    if (!childLayout) {
      throw new Error(`Missing child layout for ${child}`);
    }
    const candidate = {
      interval: child.interval,
      row: 1,
      height: childLayout.totalHeight,
    };
    for (; ; candidate.row++) {
      let anyOverlap = false;
      for (let j = 0; j < i; j++) {
        const prevChild = span.children[j];
        const prevLayout = layout.children.get(prevChild);
        if (!prevLayout) {
          throw new Error(`Missing prev child layout for ${prevChild}`);
        }
        if (overlaps(candidate, prevLayout)) {
          anyOverlap = true;
          break;
        }
      }
      if (!anyOverlap) {
        const newHeight = candidate.row + candidate.height;
        if (newHeight > layout.totalHeight) {
          layout.totalHeight = newHeight;
        }
        layout.children.set(child, candidate);
        break;
      }
    }
  }
  return layout;
}

function computeLocalLayouts(trace: Trace): Map<Span, LocalLayout> {
  const childrenRemaining = new Map();
  const leaves = [];
  for (const span of trace.spans) {
    if (span.children.length > 0) {
      childrenRemaining.set(span, span.children.length);
    } else {
      leaves.push(span);
    }
  }
  const layouts = new Map<Span, LocalLayout>();
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

export function computeLayout(trace: Trace): Span[][] {
  const localLayouts = computeLocalLayouts(trace);
  const rootLayout = localLayouts.get(trace.root);
  if (!rootLayout) {
    throw new Error("Missing root layout");
  }
  const rows: Span[][] = [];
  for (let i = 0; i < rootLayout.totalHeight; i++) {
    rows.push([]);
  }
  const stack: { row: number; span: Span }[] = [{ row: 0, span: trace.root }];
  while (stack.length > 0) {
    const { row, span } = stack.pop()!;
    rows[row].push(span);
    const layout = localLayouts.get(span);
    if (!layout) {
      throw new Error(`Missing layout for ${span}`);
    }
    for (let i = span.children.length - 1; i >= 0; i--) {
      const child = span.children[i];
      const childRect = layout.children.get(child);
      if (!childRect) {
        throw new Error(`Missing rect for ${child}`);
      }
      const childRow = row + childRect.row;
      stack.push({ row: childRow, span: child });
    }
  }

  // Sanity check that all spans within a row are non-overlapping.
  for (const row of rows) {
    let ts = -1;
    for (const span of row) {
      if (span.interval.start < ts) {
        throw new Error(
          `Span ${span.interval} overlaps with previous span ${ts} in row`
        );
      }
      if (span.interval.end < span.interval.start) {
        throw new Error(`Span ${span} has end before start`);
      }
      ts = span.interval.end;
    }
  }

  return rows;
}
