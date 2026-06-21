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
import type { EasierPlan } from './easier';

const UNASSIGNED = 255;

/**
 * Whether region `g` may grow into `cell`. Always true outside easier mode and
 * for non-line regions; a line-region may only grow along its confined line, so
 * its cells stay on a single row/column (one-line by construction).
 */
function axisAllows(plan: EasierPlan | undefined, g: number, cell: number, n: number): boolean {
  if (!plan) return true;
  const ax = plan.lineAxisOf[g];
  if (ax < 0) return true; // not a line-region
  if (ax === 0) return ((cell / n) | 0) === plan.lineIndexOf[g]; // row-confined
  return cell % n === plan.lineIndexOf[g]; // col-confined
}

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
 *
 * In easier mode (`plan` given) the chosen line-regions grow only along their
 * confined line (axis-restricted frontiers), and a pre-claim pass guarantees
 * every region reaches size >= 2 — so the one-line guarantee and the size gate
 * hold by construction, with no extra growth attempts.
 */
export function growRegions(n: number, solution: number[], rng: Rng, plan?: EasierPlan): Uint8Array {
  const total = n * n;
  const regionOf = new Uint8Array(total).fill(UNASSIGNED);
  const size = new Int32Array(n);
  const frontiers: Set<number>[] = Array.from({ length: n }, () => new Set<number>());

  for (let r = 0; r < n; r++) {
    const seed = r * n + solution[r];
    regionOf[seed] = r;
    size[r] = 1;
    for (const nb of neighbors4(seed, n)) {
      if (regionOf[nb] === UNASSIGNED && axisAllows(plan, r, nb, n)) frontiers[r].add(nb);
    }
  }

  let remaining = total - n;

  // Easier mode: pre-claim a second cell for every region so each is size >= 2
  // by construction (line-regions take their on-line `preclaim`; blobs take any
  // free neighbor). No rejection sampling — the size gate never fails on this.
  if (plan) {
    for (const spec of plan.lineRegions) {
      const cell = spec.preclaim;
      if (regionOf[cell] !== UNASSIGNED) continue; // preclaims are distinct non-seeds; safety only
      regionOf[cell] = spec.region;
      size[spec.region]++;
      remaining--;
      frontiers[spec.region].delete(cell);
      for (const nb of neighbors4(cell, n)) {
        if (regionOf[nb] === UNASSIGNED && axisAllows(plan, spec.region, nb, n)) frontiers[spec.region].add(nb);
      }
    }
    for (let r = 0; r < n; r++) {
      if (size[r] >= 2) continue; // line-regions already pre-claimed above
      const seed = r * n + solution[r];
      for (const nb of neighbors4(seed, n)) {
        if (regionOf[nb] !== UNASSIGNED || !axisAllows(plan, r, nb, n)) continue;
        regionOf[nb] = r;
        size[r]++;
        remaining--;
        frontiers[r].delete(nb);
        for (const nb2 of neighbors4(nb, n)) {
          if (regionOf[nb2] === UNASSIGNED && axisAllows(plan, r, nb2, n)) frontiers[r].add(nb2);
        }
        break;
      }
    }
  }

  const alpha = plan ? plan.alpha : 1.6; // higher → stronger pull toward equal sizes

  while (remaining > 0) {
    // Pick a region to grow, weighted toward smaller ones.
    const cands: number[] = [];
    const weights: number[] = [];
    let wsum = 0;
    for (let g = 0; g < n; g++) {
      if (frontiers[g].size === 0) continue;
      if (plan && plan.isLineRegion[g]) continue; // line-regions stay frozen at their pre-claimed segment
      const w = 1 / Math.pow(size[g], alpha);
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
      if (regionOf[nb] === UNASSIGNED && axisAllows(plan, chosen, nb, n)) frontiers[chosen].add(nb);
    }
  }

  // Easier mode only: a line-region grows along its line, so a thin strip can
  // occasionally wall off a pocket the blob frontiers never reach. Mop up any
  // such leftover cells into a neighbor — PREFER a non-line (blob) region so the
  // line-regions stay one-line; the one-line gate in uniqueness.ts catches the
  // (rare) case a cell is fully ringed by line cells and regrows. Iterates so a
  // pocket fills inward once its rim is assigned; terminates (board is connected).
  if (plan) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < total; i++) {
        if (regionOf[i] !== UNASSIGNED) continue;
        let blob = -1;
        let any = -1;
        for (const nb of neighbors4(i, n)) {
          const g = regionOf[nb];
          if (g === UNASSIGNED) continue;
          if (!plan.isLineRegion[g]) {
            blob = g;
            break;
          }
          if (any === -1) any = g;
        }
        const g = blob !== -1 ? blob : any;
        if (g !== -1) {
          regionOf[i] = g;
          changed = true;
        }
      }
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
 * Try to invalidate alternate solution q by moving one of its crowns.
 *
 * Easier mode: a cell may be moved OUT of a line-region (removal keeps the region
 * on its row/column, so it stays one-line; contiguity/size are guarded below),
 * but never INTO a line-region (that would add an off-line cell). So line-regions
 * are excluded as move targets only — this is what lets carve still eliminate an
 * alternate that merely shifts a line-region's crown within its own line.
 */
function tryCarveAlternate(n: number, regionOf: Uint8Array, p: number[], q: number[], rng: Rng, plan?: EasierPlan): boolean {
  const diffRows: number[] = [];
  for (let r = 0; r < n; r++) if (q[r] !== p[r]) diffRows.push(r);
  shuffle(diffRows, rng);
  for (const r of diffRows) {
    const a = r * n + q[r]; // a q-crown that is not a p-crown
    const gA = regionOf[a];
    const targets: number[] = [];
    for (const nb of neighbors4(a, n)) {
      const gB = regionOf[nb];
      if (gB === gA) continue;
      if (plan && plan.isLineRegion[gB]) continue; // never move a cell INTO a line-region
      if (!targets.includes(gB)) targets.push(gB);
    }
    if (targets.length === 0) continue; // a is internal to its region (or only borders line-regions)
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
function perturbCell(regionOf: Uint8Array, n: number, pCrowns: Set<number>, rng: Rng, plan?: EasierPlan): boolean {
  const total = n * n;
  const start = Math.floor(rng() * total);
  for (let off = 0; off < total; off++) {
    const c = (start + off) % total;
    if (pCrowns.has(c)) continue; // never move a solution crown
    const gC = regionOf[c];
    const targets: number[] = [];
    for (const nb of neighbors4(c, n)) {
      const gB = regionOf[nb];
      if (gB === gC) continue;
      if (plan && plan.isLineRegion[gB]) continue; // never move a cell INTO a line-region
      if (!targets.includes(gB)) targets.push(gB);
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
  plan?: EasierPlan,
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
        if (tryCarveAlternate(n, regionOf, p, q, rng, plan)) {
          moved = true;
          break;
        }
      }
      if (!moved) needPerturb = true; // stalled: no alternate's crown is movable
    }

    if (needPerturb) {
      let perturbed = false;
      for (let k = 0; k < 4; k++) if (perturbCell(regionOf, n, pCrowns, rng, plan)) perturbed = true;
      if (!perturbed) return false; // truly stuck — regrow
    }
  }
  return false; // exceeded repair budget
}

/**
 * Reject degenerate region maps: any unassigned cell, a 1-cell region, or a
 * region far larger than average. Cheap; uniqueness.ts simply regrows on fail.
 */
export function passesQualityGates(
  regionOf: ArrayLike<number>,
  n: number,
  maxCap = Math.floor(n * 2.2) + 1, // average region size is n
): boolean {
  const size = new Int32Array(n);
  for (let i = 0; i < regionOf.length; i++) {
    const g = regionOf[i];
    if (g === UNASSIGNED) return false;
    size[g]++;
  }
  for (let g = 0; g < n; g++) {
    if (size[g] < 2) return false;
    if (size[g] > maxCap) return false;
  }
  return true;
}
