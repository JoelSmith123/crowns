/**
 * hint.ts — the deduction ladder. Computes the next helpful, *correct* hint for
 * the current board, using the known solution as ground truth so a hint is never
 * misleading and one always exists while the puzzle is unsolved.
 *
 * Order (return the first that fires):
 *   1. mistake — a placed crown that isn't in the solution, or a solution cell
 *      the player has manually blocked.
 *   2. region naked single — a region with exactly one open cell.
 *   3. row / column naked single.
 *   4. region line — a region whose open cells all share one row/column (teaches
 *      the row/column feature).
 *   5. solution fallback — reveal the crown of the most-constrained open region.
 */
import type { Hint } from './types';
import { computeAutoX } from './autoblock';

export function computeHint(
  n: number,
  regionOf: ArrayLike<number>,
  solution: number[],
  crowns: ReadonlySet<number>,
  manualX: ReadonlySet<number>,
  autoBlock: boolean,
): Hint | null {
  const total = n * n;

  // Solution lookup tables.
  const solCells = new Set<number>();
  const solByRegion = new Int32Array(n).fill(-1);
  for (let r = 0; r < n; r++) {
    const cell = r * n + solution[r];
    solCells.add(cell);
    solByRegion[regionOf[cell]] = cell;
  }

  // --- 1. mistakes -----------------------------------------------------------
  for (const cell of crowns) {
    if (!solCells.has(cell)) {
      return { kind: 'focus-region', region: regionOf[cell], cell, reason: 'mistake' };
    }
  }
  for (const cell of solCells) {
    if (manualX.has(cell)) {
      return { kind: 'focus-region', region: regionOf[cell], cell, reason: 'mistake' };
    }
  }

  // Solved?
  if (crowns.size === n) return null;

  // Blocked = auto-block overlay (correct now that crowns ⊆ solution) ∪ manual X.
  const blocked = new Set<number>(manualX);
  if (autoBlock) for (const c of computeAutoX(n, regionOf, crowns)) blocked.add(c);

  const isOpen = (cell: number): boolean => !crowns.has(cell) && !blocked.has(cell);

  const regionHasCrown = new Uint8Array(n);
  const rowHasCrown = new Uint8Array(n);
  const colHasCrown = new Uint8Array(n);
  for (const cell of crowns) {
    regionHasCrown[regionOf[cell]] = 1;
    rowHasCrown[(cell / n) | 0] = 1;
    colHasCrown[cell % n] = 1;
  }

  // --- 2. region naked single ------------------------------------------------
  for (let g = 0; g < n; g++) {
    if (regionHasCrown[g]) continue;
    let open = -1;
    let count = 0;
    for (let i = 0; i < total; i++) {
      if (regionOf[i] === g && isOpen(i)) {
        open = i;
        count++;
        if (count > 1) break;
      }
    }
    if (count === 1) return { kind: 'place-crown', cell: open, reason: 'region-single' };
  }

  // --- 3. row / column naked single -----------------------------------------
  for (let r = 0; r < n; r++) {
    if (rowHasCrown[r]) continue;
    let open = -1;
    let count = 0;
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (isOpen(i)) {
        open = i;
        count++;
        if (count > 1) break;
      }
    }
    if (count === 1) return { kind: 'place-crown', cell: open, reason: 'row-single' };
  }
  for (let c = 0; c < n; c++) {
    if (colHasCrown[c]) continue;
    let open = -1;
    let count = 0;
    for (let r = 0; r < n; r++) {
      const i = r * n + c;
      if (isOpen(i)) {
        open = i;
        count++;
        if (count > 1) break;
      }
    }
    if (count === 1) return { kind: 'place-crown', cell: open, reason: 'col-single' };
  }

  // --- 4. region line --------------------------------------------------------
  for (let g = 0; g < n; g++) {
    if (regionHasCrown[g]) continue;
    const open: number[] = [];
    for (let i = 0; i < total; i++) if (regionOf[i] === g && isOpen(i)) open.push(i);
    if (open.length < 2) continue;
    const rows = new Set(open.map((i) => (i / n) | 0));
    const cols = new Set(open.map((i) => i % n));
    if (rows.size === 1) {
      return { kind: 'region-line', region: g, axis: 'row', line: (open[0] / n) | 0, cells: open, reason: 'region-line' };
    }
    if (cols.size === 1) {
      return { kind: 'region-line', region: g, axis: 'col', line: open[0] % n, cells: open, reason: 'region-line' };
    }
  }

  // --- 5. solution fallback: most-constrained open region -------------------
  let bestRegion = -1;
  let bestOpen = Infinity;
  for (let g = 0; g < n; g++) {
    if (regionHasCrown[g]) continue;
    let count = 0;
    for (let i = 0; i < total; i++) if (regionOf[i] === g && isOpen(i)) count++;
    if (count > 0 && count < bestOpen && isOpen(solByRegion[g])) {
      bestOpen = count;
      bestRegion = g;
    }
  }
  if (bestRegion >= 0) {
    return { kind: 'place-crown', cell: solByRegion[bestRegion], reason: 'solution-fallback' };
  }

  return null;
}
