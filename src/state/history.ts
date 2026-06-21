/**
 * history.ts — the undo stack. One user gesture = one Transaction recording only
 * the diffs to the explicit player state (crowns + manual X). Auto-X is derived,
 * so it never needs recording; undoing a crown recomputes its blocks away.
 */

export interface Transaction {
  crownsAdd: number[];
  crownsDel: number[];
  manualXAdd: number[];
  manualXDel: number[];
  label: string;
}

const MAX_DEPTH = 300;

export class History {
  private stack: Transaction[] = [];

  push(tx: Transaction): void {
    this.stack.push(tx);
    if (this.stack.length > MAX_DEPTH) this.stack.shift();
  }

  pop(): Transaction | undefined {
    return this.stack.pop();
  }

  clear(): void {
    this.stack.length = 0;
  }

  get size(): number {
    return this.stack.length;
  }
}
