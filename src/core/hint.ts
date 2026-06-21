/**
 * hint.ts — pick the next crown to place.
 *
 * The Hint button PLACES a crown (with auto-block) rather than just pointing,
 * so this returns the solution's crown for the most-constrained region that
 * doesn't have a crown yet. Using the known solution guarantees the placement is
 * always correct; choosing the most-constrained (fewest open cells) region makes
 * it the most "obvious" next move. Returns null when every region already has a
 * crown (nothing left to place).
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

  // The solution's crown cell for each region.
  const solByRegion = new Int32Array(n).fill(-1);
  for (let r = 0; r < n; r++) {
    const cell = r * n + solution[r];
    solByRegion[regionOf[cell]] = cell;
  }

  // Which regions already have a crown.
  const regionHasCrown = new Uint8Array(n);
  for (const c of crowns) regionHasCrown[regionOf[c]] = 1;

  // Blocked cells (for counting how "determined" each region is).
  const blocked = new Set<number>(manualX);
  if (autoBlock) for (const c of computeAutoX(n, regionOf, crowns)) blocked.add(c);
  const isOpen = (cell: number): boolean => !crowns.has(cell) && !blocked.has(cell);

  // Most-constrained region without a crown.
  let best = -1;
  let bestOpen = Infinity;
  for (let g = 0; g < n; g++) {
    if (regionHasCrown[g]) continue;
    let open = 0;
    for (let i = 0; i < total; i++) if (regionOf[i] === g && isOpen(i)) open++;
    if (open < bestOpen) {
      bestOpen = open;
      best = g;
    }
  }

  if (best < 0) return null; // every region already has a crown

  return {
    kind: 'place-crown',
    cell: solByRegion[best],
    reason: bestOpen === 1 ? 'region-single' : 'solution-fallback',
  };
}
