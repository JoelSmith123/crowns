/**
 * easier.ts — "Easier mode" generation policy (pure, worker-safe).
 *
 * Easier puzzles are made easier *by construction*, never by generate-and-check
 * rejection (which would inflate attempt counts). The lever is GUARANTEED
 * "one-line regions": a region whose cells all lie in a single row OR a single
 * column. Such a region pins its crown to that line, which cascades naked
 * singles in the solver — so one-line regions make a board both easier to read
 * and *easier to verify* (fewer alternate solutions), i.e. carving does no more
 * work, usually less.
 *
 * `planEasier` decides, for a given solution, which regions become line-regions
 * (and on which axis), and pre-selects the length-2 cell that guarantees each
 * reaches size >= 2 on its line. generator.ts consumes the plan: axis-restricted
 * growth keeps those regions one-line, and carve never moves a cell INTO a
 * line-region (so the property is preserved without ever blocking a carve).
 */
import type { Rng } from './rng';
import { range, shuffle, randInt } from './rng';

export type LineAxis = 'row' | 'col';

/** One region forced onto a single line, with the cell that seeds its length. */
export interface LineRegionSpec {
  region: number; // region id (== solution row r, since region r is seeded at row r)
  axis: LineAxis;
  line: number; // row index (axis 'row') or column index (axis 'col')
  preclaim: number; // a length-2 cell on the line, pre-claimed to guarantee size >= 2
}

/** Everything generator.ts needs to build + preserve an easier-mode board. */
export interface EasierPlan {
  lineRegions: LineRegionSpec[];
  isLineRegion: Uint8Array; // [n] 1 if region is a line-region
  lineAxisOf: Int8Array; // [n] 0=row, 1=col, -1=none
  lineIndexOf: Int16Array; // [n] confined line index, -1 if none
  targetLen: Int16Array; // [n] desired length a line-region grows to along its line (varied; 0 for non-line)
  alpha: number; // region-size balance weight (higher → smaller, more uniform regions)
  maxCap: number; // size gate cap (kept at the default; "smaller" comes from alpha, not a tighter cap)
}

/**
 * Minimum guaranteed one-line regions by board size. The 10-board sits in the
 * stricter 10–12 band. Tunable constants.
 */
export function lineRegionThreshold(n: number): number {
  if (n <= 9) return 2;
  if (n <= 12) return 3;
  return 4; // 13..15
}

/**
 * Count regions whose cells all share one row OR all share one column. O(n^2),
 * single pass. Used as a belt-and-suspenders gate (it passes by construction).
 */
export function countOneLineRegions(regionOf: ArrayLike<number>, n: number): number {
  const seen = new Uint8Array(n);
  const firstRow = new Int32Array(n);
  const firstCol = new Int32Array(n);
  const sameRow = new Uint8Array(n).fill(1);
  const sameCol = new Uint8Array(n).fill(1);
  for (let i = 0; i < regionOf.length; i++) {
    const g = regionOf[i];
    if (g < 0 || g >= n) continue;
    const r = (i / n) | 0;
    const c = i % n;
    if (!seen[g]) {
      seen[g] = 1;
      firstRow[g] = r;
      firstCol[g] = c;
    } else {
      if (r !== firstRow[g]) sameRow[g] = 0;
      if (c !== firstCol[g]) sameCol[g] = 0;
    }
  }
  let count = 0;
  for (let g = 0; g < n; g++) if (seen[g] && (sameRow[g] || sameCol[g])) count++;
  return count;
}

/**
 * Choose k = threshold(n) line-regions for a solution and pin each to a line.
 *
 * Region r is seeded at the solution crown (r, p[r]). A row-line region grows
 * within row r; a col-line region within column p[r]. We pre-claim one in-line
 * neighbor of the seed (the length-2 cell). Because p is a permutation, seeds
 * occupy distinct rows AND columns, so same-axis line-regions never share a
 * lane; the only possible contention is a row-line and a col-line wanting the
 * same crossing cell, which the `claimed` set + "pick another candidate / another
 * region" greedy resolves deterministically. Every seed has >= 2 in-bounds
 * candidate cells, so with k <= 4 on an n >= 8 board this always selects k
 * line-regions on the first try (no rejection). Deterministic given the rng.
 */
export function planEasier(n: number, p: number[], rng: Rng): EasierPlan {
  const k = lineRegionThreshold(n);
  const isLineRegion = new Uint8Array(n);
  const lineAxisOf = new Int8Array(n).fill(-1);
  const lineIndexOf = new Int16Array(n).fill(-1);
  const targetLen = new Int16Array(n);
  const lineRegions: LineRegionSpec[] = [];
  const claimed = new Set<number>(); // preclaim cells already taken (avoids row×col crossing collisions)

  // Varied line-region lengths, biased long (carve trims some back toward 2, so we
  // aim high). Scaled with board size so big boards get the longest strips.
  const maxLen = Math.min(6, Math.max(5, Math.floor(n / 2)));

  const order = shuffle(range(n), rng); // region pick order → varied placement
  for (const r of order) {
    if (lineRegions.length >= k) break;
    const c = p[r];
    // In-bounds (axis, line, cell) candidates: two along the row, two along the column.
    const cands: Array<{ axis: LineAxis; line: number; cell: number }> = [];
    if (c - 1 >= 0) cands.push({ axis: 'row', line: r, cell: r * n + (c - 1) });
    if (c + 1 < n) cands.push({ axis: 'row', line: r, cell: r * n + (c + 1) });
    if (r - 1 >= 0) cands.push({ axis: 'col', line: c, cell: (r - 1) * n + c });
    if (r + 1 < n) cands.push({ axis: 'col', line: c, cell: (r + 1) * n + c });

    const free = cands.filter((x) => !claimed.has(x.cell));
    if (free.length === 0) continue; // (vanishingly rare) all candidates taken → try another region

    const choice = free[Math.floor(rng() * free.length)];
    claimed.add(choice.cell);
    isLineRegion[r] = 1;
    lineAxisOf[r] = choice.axis === 'row' ? 0 : 1;
    lineIndexOf[r] = choice.line;
    targetLen[r] = randInt(rng, 3, maxLen); // [3..maxLen]; growth may fall short if the line fills up
    lineRegions.push({ region: r, axis: choice.axis, line: choice.line, preclaim: choice.cell });
  }

  return {
    lineRegions,
    isLineRegion,
    lineAxisOf,
    lineIndexOf,
    targetLen,
    alpha: 2.0, // > the default 1.6: tighter size balance → smaller, more uniform regions
    maxCap: Math.floor(n * 2.2) + 1, // default cap; do NOT tighten (would become rejection sampling)
  };
}
