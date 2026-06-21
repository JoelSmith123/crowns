/**
 * autoblock.ts — pure derivations over the explicit player state (crowns +
 * manual X), plus the row/column auto-block feature predicate.
 */
import type { RowColPlan } from './types';
import { neighbors8, isAdjacent8 } from './grid';

/**
 * The auto-block overlay: every cell that a placed crown rules out — its whole
 * row, whole column, the 8 neighbors, and the rest of its region — minus the
 * crowns themselves. A pure function of the crown set, so undo/auto-block-toggle
 * are just recomputes.
 */
export function computeAutoX(n: number, regionOf: ArrayLike<number>, crowns: ReadonlySet<number>): Set<number> {
  const out = new Set<number>();
  const total = n * n;
  for (const cell of crowns) {
    const r = (cell / n) | 0;
    const c = cell % n;
    const g = regionOf[cell];
    for (let cc = 0; cc < n; cc++) out.add(r * n + cc); // row
    for (let rr = 0; rr < n; rr++) out.add(rr * n + c); // column
    for (const nb of neighbors8(cell, n)) out.add(nb); // king neighbors
    for (let i = 0; i < total; i++) if (regionOf[i] === g) out.add(i); // region
  }
  for (const cell of crowns) out.delete(cell);
  return out;
}

/** Crowns that currently break a rule (duplicate row/col/region, or adjacency). */
export function computeConflicts(n: number, regionOf: ArrayLike<number>, crowns: ReadonlySet<number>): Set<number> {
  const out = new Set<number>();
  const arr = [...crowns];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i];
      const b = arr[j];
      const sameRow = ((a / n) | 0) === ((b / n) | 0);
      const sameCol = a % n === b % n;
      const sameRegion = regionOf[a] === regionOf[b];
      if (sameRow || sameCol || sameRegion || isAdjacent8(a, b, n)) {
        out.add(a);
        out.add(b);
      }
    }
  }
  return out;
}

/** Is the placement a complete, valid win? */
export function isSolved(n: number, regionOf: ArrayLike<number>, crowns: ReadonlySet<number>): boolean {
  return crowns.size === n && computeConflicts(n, regionOf, crowns).size === 0;
}

function collectLineTargets(
  n: number,
  regionOf: ArrayLike<number>,
  region: number,
  crowns: ReadonlySet<number>,
  blocked: ReadonlySet<number>,
  axis: 'row' | 'col',
  line: number,
): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = axis === 'row' ? line * n + k : k * n + line;
    if (regionOf[i] !== region && !crowns.has(i) && !blocked.has(i)) out.push(i);
  }
  return out;
}

/**
 * Row/column auto-block feature: if a region's still-open cells all lie on one
 * row (or one column), that region's crown must be on that line, so every other
 * region's open cell on the line can be blocked. Returns the plan (with the new
 * blocks to place) or null if it does not apply / would place nothing new.
 *
 * `blocked` is the set of cells currently shown as X (auto + manual).
 */
export function rowColPlan(
  n: number,
  regionOf: ArrayLike<number>,
  region: number,
  crowns: ReadonlySet<number>,
  blocked: ReadonlySet<number>,
): RowColPlan | null {
  const total = n * n;
  const open: number[] = [];
  for (let i = 0; i < total; i++) {
    if (regionOf[i] === region && !crowns.has(i) && !blocked.has(i)) open.push(i);
  }
  if (open.length === 0) return null;

  const rows = new Set(open.map((i) => (i / n) | 0));
  const cols = new Set(open.map((i) => i % n));

  if (rows.size === 1 && cols.size > 1) {
    const line = open[0] === undefined ? -1 : (open[0] / n) | 0;
    const targets = collectLineTargets(n, regionOf, region, crowns, blocked, 'row', line);
    return targets.length ? { region, axis: 'row', line, targets } : null;
  }
  if (cols.size === 1 && rows.size > 1) {
    const line = open[0] % n;
    const targets = collectLineTargets(n, regionOf, region, crowns, blocked, 'col', line);
    return targets.length ? { region, axis: 'col', line, targets } : null;
  }
  if (rows.size === 1 && cols.size === 1) {
    // Single open cell — its crown is forced here; block whichever line has new targets.
    const rr = (open[0] / n) | 0;
    const cc = open[0] % n;
    const rowTargets = collectLineTargets(n, regionOf, region, crowns, blocked, 'row', rr);
    if (rowTargets.length) return { region, axis: 'row', line: rr, targets: rowTargets };
    const colTargets = collectLineTargets(n, regionOf, region, crowns, blocked, 'col', cc);
    if (colTargets.length) return { region, axis: 'col', line: cc, targets: colTargets };
    return null;
  }
  return null; // open cells span multiple rows AND columns → not line-confined
}
