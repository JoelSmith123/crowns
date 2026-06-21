/**
 * uniqueness.ts — generate a puzzle with a guaranteed unique solution.
 *
 * Loop: pick N, pick a valid solution, grow regions, accept iff the solver finds
 * exactly one solution (which is then guaranteed to be our chosen solution).
 * Region growth is cheap and the solver early-exits at 2, so this converges in a
 * handful of tries even at N=15.
 */
import type { GeneratedPuzzle } from './types';
import type { Rng } from './rng';
import { randInt } from './rng';
import { randomSolution, growRegions, carveToUnique, passesQualityGates } from './generator';

export interface GenOptions {
  minN?: number;
  maxN?: number;
  /** Force a specific size (testing / debugging). Overrides min/max. */
  fixedN?: number;
  /** Region-growth + carve attempts before redrawing the solution. */
  maxGrowAttempts?: number;
}

/**
 * Generate a puzzle with a guaranteed unique solution.
 *
 * Random region maps almost never have a unique solution on their own, so we
 * grow regions and then carve (region surgery, see carveToUnique) to eliminate
 * every alternate solution. The intended solution is preserved throughout, so
 * it is the unique answer.
 */
export function generateUniquePuzzle(rng: Rng, id: number, opts: GenOptions = {}): GeneratedPuzzle {
  const minN = opts.minN ?? 8;
  const maxN = opts.maxN ?? 15;
  const maxGrow = opts.maxGrowAttempts ?? 80;

  for (let outer = 0; outer < 1000; outer++) {
    const n = opts.fixedN ?? randInt(rng, minN, maxN);
    const solution = randomSolution(n, rng);
    if (!solution) continue; // impossible for n>=4

    for (let ga = 0; ga < maxGrow; ga++) {
      const regionOf = growRegions(n, solution, rng);
      if (!carveToUnique(n, regionOf, solution, rng)) continue; // stalled → regrow
      if (!passesQualityGates(regionOf, n)) continue; // carving distorted sizes → regrow
      return {
        id,
        n,
        regionOf: Array.from(regionOf),
        solution: solution.slice(),
      };
    }
  }

  throw new Error('generateUniquePuzzle: exhausted attempts (should never happen)');
}
