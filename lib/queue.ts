export class Queue<T> {
  reversed: T[];
  inOrder: T[];

  constructor(elements?: T[]) {
    this.reversed = [];
    this.inOrder = elements ?? [];
  }

  push(element: T) {
    this.inOrder.push(element);
  }

  pop(): T | undefined {
    if (this.reversed.length > 0) {
      return this.reversed.pop();
    }
    if (this.inOrder.length == 0) {
      return undefined;
    }
    this.inOrder.reverse();
    const newReversed = this.inOrder;
    this.inOrder = this.reversed;
    this.reversed = newReversed;
    return this.reversed.pop();
  }

  get length(): number {
    return this.reversed.length + this.inOrder.length;
  }
}
