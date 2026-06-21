/**
 * solver.ts — constraint-propagation solver for Crowns.
 *
 * Rows, columns and regions are all "units" that need exactly one crown.
 * Placing a crown eliminates every other cell in its row, column, region and its
 * 8 neighbors. Propagation repeatedly places any unit that has exactly one
 * candidate left (a naked single) until a fixpoint; only then does it branch on
 * the most-constrained unit. For well-formed (deduction-solvable) puzzles this
 * places the whole solution with no branching, so uniqueness is confirmed almost
 * instantly — which is exactly what the carving generator hammers.
 */
import { neighbors8 } from './grid';

export interface SearchResult {
  results: number[][];
  /** True if the search hit the node budget before completing. */
  aborted: boolean;
}

/**
 * Core search. Enumerates up to `limit` solutions; if more than `budget` search
 * nodes are visited it bails out with aborted=true (used to reject puzzles whose
 * uniqueness can't be confirmed by cheap deduction — i.e. the un-LinkedIn-like
 * ones that would need guessing).
 */
export function runSearch(
  n: number,
  regionOf: ArrayLike<number>,
  limit: number,
  budget: number,
): SearchResult {
  const total = n * n;
  const regionCells: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < total; i++) regionCells[regionOf[i]].push(i);
  const neigh: number[][] = new Array(total);
  for (let i = 0; i < total; i++) neigh[i] = neighbors8(i, n);

  const results: number[][] = [];
  let nodes = 0;
  let aborted = false;

  // Mutable shared state with a journaled undo log — no per-branch allocation.
  const alive = new Uint8Array(total).fill(1);
  const rowCount = new Int16Array(n).fill(n);
  const colCount = new Int16Array(n).fill(n);
  const regCount = Int16Array.from(regionCells, (cs) => cs.length);
  const rowDone = new Uint8Array(n);
  const colDone = new Uint8Array(n);
  const regDone = new Uint8Array(n);
  const col = new Int8Array(n).fill(-1);
  let done = 0;

  const cap = total + n + 16;
  const jType = new Uint8Array(cap); // 0 = elimination, 1 = placement
  const jVal = new Int32Array(cap);
  let jpos = 0;

  function elim(x: number): void {
    if (!alive[x]) return;
    alive[x] = 0;
    rowCount[(x / n) | 0]--;
    colCount[x % n]--;
    regCount[regionOf[x]]--;
    jType[jpos] = 0;
    jVal[jpos] = x;
    jpos++;
  }

  function place(cell: number): void {
    jType[jpos] = 1;
    jVal[jpos] = cell;
    jpos++;
    const r = (cell / n) | 0;
    const c = cell % n;
    const g = regionOf[cell];
    col[r] = c;
    rowDone[r] = 1;
    colDone[c] = 1;
    regDone[g] = 1;
    done++;
    for (let cc = 0; cc < n; cc++) elim(r * n + cc);
    for (let rr = 0; rr < n; rr++) elim(rr * n + c);
    for (const x of regionCells[g]) elim(x);
    for (const x of neigh[cell]) elim(x);
  }

  function rewind(mark: number): void {
    while (jpos > mark) {
      jpos--;
      const v = jVal[jpos];
      if (jType[jpos] === 0) {
        alive[v] = 1;
        rowCount[(v / n) | 0]++;
        colCount[v % n]++;
        regCount[regionOf[v]]++;
      } else {
        const r = (v / n) | 0;
        const c = v % n;
        rowDone[r] = 0;
        colDone[c] = 0;
        regDone[regionOf[v]] = 0;
        col[r] = -1;
        done--;
      }
    }
  }

  /** Apply naked singles to fixpoint. Returns false on a contradiction. */
  function propagate(): boolean {
    let progress = true;
    while (progress) {
      progress = false;
      for (let r = 0; r < n; r++) {
        if (rowDone[r]) continue;
        if (rowCount[r] === 0) return false;
        if (rowCount[r] === 1) {
          for (let c = 0; c < n; c++)
            if (alive[r * n + c]) {
              place(r * n + c);
              break;
            }
          progress = true;
        }
      }
      for (let c = 0; c < n; c++) {
        if (colDone[c]) continue;
        if (colCount[c] === 0) return false;
        if (colCount[c] === 1) {
          for (let r = 0; r < n; r++)
            if (alive[r * n + c]) {
              place(r * n + c);
              break;
            }
          progress = true;
        }
      }
      for (let g = 0; g < n; g++) {
        if (regDone[g]) continue;
        if (regCount[g] === 0) return false;
        if (regCount[g] === 1) {
          for (const x of regionCells[g])
            if (alive[x]) {
              place(x);
              break;
            }
          progress = true;
        }
      }
    }
    return true;
  }

  function search(): void {
    if (results.length >= limit || aborted) return;
    if (++nodes > budget) {
      aborted = true;
      return;
    }
    const mark = jpos;
    if (!propagate()) {
      rewind(mark);
      return;
    }
    if (done === n) {
      results.push(Array.from(col));
      rewind(mark);
      return;
    }
    // Branch on the most-constrained undone unit (all have count >= 2 here).
    let bestKind = -1;
    let bestIdx = -1;
    let best = Infinity;
    for (let r = 0; r < n; r++) if (!rowDone[r] && rowCount[r] < best) ((best = rowCount[r]), (bestKind = 0), (bestIdx = r));
    for (let c = 0; c < n; c++) if (!colDone[c] && colCount[c] < best) ((best = colCount[c]), (bestKind = 1), (bestIdx = c));
    for (let g = 0; g < n; g++) if (!regDone[g] && regCount[g] < best) ((best = regCount[g]), (bestKind = 2), (bestIdx = g));

    const cells: number[] = [];
    if (bestKind === 0) {
      for (let c = 0; c < n; c++) if (alive[bestIdx * n + c]) cells.push(bestIdx * n + c);
    } else if (bestKind === 1) {
      for (let r = 0; r < n; r++) if (alive[r * n + bestIdx]) cells.push(r * n + bestIdx);
    } else {
      for (const x of regionCells[bestIdx]) if (alive[x]) cells.push(x);
    }

    for (const cell of cells) {
      const m2 = jpos;
      place(cell);
      search();
      rewind(m2);
      if (results.length >= limit || aborted) break;
    }
    rewind(mark);
  }

  search();
  return { results, aborted };
}

/** Enumerate up to `limit` solutions (no node budget). */
export function enumerate(n: number, regionOf: ArrayLike<number>, limit: number): number[][] {
  return runSearch(n, regionOf, limit, Infinity).results;
}

/** Count solutions, stopping early once `limit` is reached. */
export function countSolutions(n: number, regionOf: ArrayLike<number>, limit = 2): number {
  return enumerate(n, regionOf, limit).length;
}

/** Return one solution (p[row]=col), or null if unsolvable. */
export function firstSolution(n: number, regionOf: ArrayLike<number>): number[] | null {
  const sols = enumerate(n, regionOf, 1);
  return sols.length ? sols[0] : null;
}

/**
 * Independent reference solver (fixed row order, no propagation). Slower but
 * obviously correct; used in tests to cross-check enumerate().
 */
export function countSolutionsBrute(n: number, regionOf: ArrayLike<number>, limit = Infinity): number {
  let count = 0;
  function rec(row: number, prevCol: number, usedCols: number, usedRegions: number): void {
    if (count >= limit) return;
    if (row === n) {
      count++;
      return;
    }
    const base = row * n;
    for (let c = 0; c < n; c++) {
      const colBit = 1 << c;
      if (usedCols & colBit) continue;
      if (row > 0 && c >= prevCol - 1 && c <= prevCol + 1) continue;
      const g = regionOf[base + c];
      const regBit = 1 << g;
      if (usedRegions & regBit) continue;
      rec(row + 1, c, usedCols | colBit, usedRegions | regBit);
      if (count >= limit) return;
    }
  }
  rec(0, -10, 0, 0);
  return count;
}
