/**
 * generator.ts — build a random solution and grow colored regions around it.
 *
 * Strategy: pick a valid crown placement first (guarantees solvability), then
 * grow N contiguous regions from the crown seeds. uniqueness.ts wraps this and
 * only accepts region maps whose puzzle has a unique solution.
 */
import type { Rng } from './rng';
import { range, shuffle } from './rng';
import { neighbors4 } from './grid';
import { runSearch } from './solver';

const UNASSIGNED = 255;

/**
 * A random non-attacking crown placement: a permutation p of columns with
 * |p[r] - p[r+1]| >= 2 for consecutive rows. Returns p (p[row]=col) or null.
 */
export function randomSolution(n: number, rng: Rng): number[] | null {
  const p = new Array<number>(n).fill(-1);
  const usedCols = new Uint8Array(n);
  const order = shuffle(range(n), rng); // randomized column-try order → varied solutions

  function rec(row: number, prevCol: number): boolean {
    if (row === n) return true;
    for (let k = 0; k < n; k++) {
      const c = order[k];
      if (usedCols[c]) continue;
      if (row > 0 && Math.abs(c - prevCol) < 2) continue;
      p[row] = c;
      usedCols[c] = 1;
      if (rec(row + 1, c)) return true;
      usedCols[c] = 0;
    }
    p[row] = -1;
    return false;
  }

  return rec(0, -10) ? p : null;
}

/**
 * Grow N contiguous regions from the crown seeds via weighted multi-source BFS.
 * - 4-neighbor growth keeps regions blob-like (matches the reference art).
 * - Inverse-size weighting balances region areas (no slivers, no monsters).
 * - Compactness bias (prefer frontier cells with more same-region neighbors)
 *   yields rounder shapes with fewer tendrils.
 * Contiguity and one-seed-per-region are invariants by construction.
 */
export function growRegions(n: number, solution: number[], rng: Rng): Uint8Array {
  const total = n * n;
  const regionOf = new Uint8Array(total).fill(UNASSIGNED);
  const size = new Int32Array(n);
  const frontiers: Set<number>[] = Array.from({ length: n }, () => new Set<number>());

  for (let r = 0; r < n; r++) {
    const seed = r * n + solution[r];
    regionOf[seed] = r;
    size[r] = 1;
    for (const nb of neighbors4(seed, n)) {
      if (regionOf[nb] === UNASSIGNED) frontiers[r].add(nb);
    }
  }

  const ALPHA = 1.6; // higher → stronger pull toward equal sizes
  let remaining = total - n;

  while (remaining > 0) {
    // Pick a region to grow, weighted toward smaller ones.
    const cands: number[] = [];
    const weights: number[] = [];
    let wsum = 0;
    for (let g = 0; g < n; g++) {
      if (frontiers[g].size === 0) continue;
      const w = 1 / Math.pow(size[g], ALPHA);
      cands.push(g);
      weights.push(w);
      wsum += w;
    }
    if (cands.length === 0) break; // unreachable on a connected board

    let pick = rng() * wsum;
    let chosen = cands[cands.length - 1];
    for (let i = 0; i < cands.length; i++) {
      pick -= weights[i];
      if (pick <= 0) {
        chosen = cands[i];
        break;
      }
    }

    // Pick a frontier cell of `chosen`, biased toward compactness.
    let cell = -1;
    let bestScore = -1;
    for (const f of frontiers[chosen]) {
      if (regionOf[f] !== UNASSIGNED) continue; // stale entry
      let same = 0;
      for (const nb of neighbors4(f, n)) {
        if (regionOf[nb] === chosen) same++;
      }
      const score = same + rng() * 0.9; // jitter < 1 keeps compactness dominant
      if (score > bestScore) {
        bestScore = score;
        cell = f;
      }
    }

    if (cell === -1) {
      // Every frontier entry was stale; clear it so this region drops out.
      frontiers[chosen].clear();
      continue;
    }

    regionOf[cell] = chosen;
    size[chosen]++;
    remaining--;
    frontiers[chosen].delete(cell);
    for (const nb of neighbors4(cell, n)) {
      if (regionOf[nb] === UNASSIGNED) frontiers[chosen].add(nb);
    }
  }

  return regionOf;
}

/**
 * True if region g (the region of `cell`) would remain connected and keep >= 2
 * cells after `cell` is removed from it. Used to keep carving moves legal.
 */
function regionStaysHealthyWithout(regionOf: Uint8Array, n: number, cell: number): boolean {
  const g = regionOf[cell];
  let start = -1;
  let count = 0;
  for (let i = 0; i < regionOf.length; i++) {
    if (regionOf[i] === g && i !== cell) {
      count++;
      if (start === -1) start = i;
    }
  }
  if (count < 2) return false; // keep regions at >= 2 cells
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of neighbors4(cur, n)) {
      if (nb !== cell && regionOf[nb] === g && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === count;
}

/**
 * Carve the region map until the puzzle has a unique solution, mutating
 * `regionOf` in place. Strategy: while an alternate solution q exists, pick a
 * row where q differs from the intended solution p, and move that q-crown cell
 * into an adjacent region. This removes q's crown from its region (invalidating
 * q) while leaving every p-crown in place (p stays valid) and keeping regions
 * contiguous. Returns true on success, false if it stalls (caller regrows).
 */
/** Try to invalidate alternate solution q by moving one of its crowns. */
function tryCarveAlternate(n: number, regionOf: Uint8Array, p: number[], q: number[], rng: Rng): boolean {
  const diffRows: number[] = [];
  for (let r = 0; r < n; r++) if (q[r] !== p[r]) diffRows.push(r);
  shuffle(diffRows, rng);
  for (const r of diffRows) {
    const a = r * n + q[r]; // a q-crown that is not a p-crown
    const gA = regionOf[a];
    const targets: number[] = [];
    for (const nb of neighbors4(a, n)) {
      const gB = regionOf[nb];
      if (gB !== gA && !targets.includes(gB)) targets.push(gB);
    }
    if (targets.length === 0) continue; // a is internal to its region
    if (!regionStaysHealthyWithout(regionOf, n, a)) continue;
    regionOf[a] = targets[Math.floor(rng() * targets.length)];
    return true;
  }
  return false;
}

/**
 * Move a random boundary cell into an adjacent region (never a solution-crown
 * cell, so the intended solution stays valid). Used to escape a carve stall
 * without discarding progress. Returns true if a cell was moved.
 */
function perturbCell(regionOf: Uint8Array, n: number, pCrowns: Set<number>, rng: Rng): boolean {
  const total = n * n;
  const start = Math.floor(rng() * total);
  for (let off = 0; off < total; off++) {
    const c = (start + off) % total;
    if (pCrowns.has(c)) continue; // never move a solution crown
    const gC = regionOf[c];
    const targets: number[] = [];
    for (const nb of neighbors4(c, n)) {
      const gB = regionOf[nb];
      if (gB !== gC && !targets.includes(gB)) targets.push(gB);
    }
    if (targets.length === 0) continue;
    if (!regionStaysHealthyWithout(regionOf, n, c)) continue;
    regionOf[c] = targets[Math.floor(rng() * targets.length)];
    return true;
  }
  return false;
}

const ALTS_PER_STEP = 6;

export function carveToUnique(
  n: number,
  regionOf: Uint8Array,
  p: number[],
  rng: Rng,
  maxRepairs = 400,
  solveBudget = 12000,
): boolean {
  const pCrowns = new Set<number>();
  for (let r = 0; r < n; r++) pCrowns.add(r * n + p[r]);

  for (let iter = 0; iter < maxRepairs; iter++) {
    // Pull several alternates at once so we can almost always find a carvable one.
    const { results, aborted } = runSearch(n, regionOf, ALTS_PER_STEP, solveBudget);

    let needPerturb = false;
    if (aborted) {
      // Too hard to verify cheaply — nudge toward a more deduction-friendly board
      // (keeps the low budget, so accepted puzzles stay nice) instead of regrowing.
      needPerturb = true;
    } else if (results.length <= 1) {
      return true; // only the intended solution → unique
    } else {
      const alts: number[][] = [];
      for (const s of results) {
        let differs = false;
        for (let r = 0; r < n; r++) if (s[r] !== p[r]) {
          differs = true;
          break;
        }
        if (differs) alts.push(s);
      }
      shuffle(alts, rng);

      let moved = false;
      for (const q of alts) {
        if (tryCarveAlternate(n, regionOf, p, q, rng)) {
          moved = true;
          break;
        }
      }
      if (!moved) needPerturb = true; // stalled: no alternate's crown is movable
    }

    if (needPerturb) {
      let perturbed = false;
      for (let k = 0; k < 4; k++) if (perturbCell(regionOf, n, pCrowns, rng)) perturbed = true;
      if (!perturbed) return false; // truly stuck — regrow
    }
  }
  return false; // exceeded repair budget
}

/**
 * Reject degenerate region maps: any unassigned cell, a 1-cell region, or a
 * region far larger than average. Cheap; uniqueness.ts simply regrows on fail.
 */
export function passesQualityGates(regionOf: ArrayLike<number>, n: number): boolean {
  const size = new Int32Array(n);
  for (let i = 0; i < regionOf.length; i++) {
    const g = regionOf[i];
    if (g === UNASSIGNED) return false;
    size[g]++;
  }
  const maxCap = Math.floor(n * 2.2) + 1; // average region size is n
  for (let g = 0; g < n; g++) {
    if (size[g] < 2) return false;
    if (size[g] > maxCap) return false;
  }
  return true;
}
