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
import { planEasier, countOneLineRegions } from './easier';

export interface GenOptions {
  minN?: number;
  maxN?: number;
  /** Force a specific size (testing / debugging). Overrides min/max. */
  fixedN?: number;
  /** Region-growth + carve attempts before redrawing the solution. */
  maxGrowAttempts?: number;
  /** Easier mode: guarantee one-line regions + smaller/more-uniform regions. */
  easier?: boolean;
  /**
   * Optional instrumentation: receives the number of grow+carve attempts the
   * accepted puzzle took (the load-independent perf metric; see docs/architecture).
   */
  onStats?: (stats: { growAttempts: number }) => void;
}

/** True if every cell has a valid region id (no UNASSIGNED leftover from growth). */
function isComplete(regionOf: ArrayLike<number>, n: number): boolean {
  for (let i = 0; i < regionOf.length; i++) if (regionOf[i] >= n) return false;
  return true;
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

  let growAttempts = 0;
  for (let outer = 0; outer < 1000; outer++) {
    const n = opts.fixedN ?? randInt(rng, minN, maxN);
    const solution = randomSolution(n, rng);
    if (!solution) continue; // impossible for n>=4

    for (let ga = 0; ga < maxGrow; ga++) {
      growAttempts++;
      // Easier mode: re-choose the line-regions each attempt (deterministic for the
      // seed). A fresh choice escapes an unlucky one that resists carving, keeping
      // attempt counts flat. Undefined → normal generation.
      const plan = opts.easier ? planEasier(n, solution, rng) : undefined;
      const regionOf = growRegions(n, solution, rng, plan);
      // Easier mode: a line strip can (rarely) ring a pocket the blob fill can't
      // reach, leaving cells unassigned. Regrow rather than break a line-region.
      if (plan && !isComplete(regionOf, n)) continue;
      if (!carveToUnique(n, regionOf, solution, rng, plan)) continue; // stalled → regrow
      if (!passesQualityGates(regionOf, n, plan?.maxCap)) continue; // carving distorted sizes → regrow
      // Belt-and-suspenders: holds by construction (axis-restricted growth + carve
      // never moves a cell into a line-region), so this never triggers a regrow.
      if (plan && countOneLineRegions(regionOf, n) < plan.lineRegions.length) continue;
      opts.onStats?.({ growAttempts });
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
