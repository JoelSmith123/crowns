import { describe, it, expect } from 'vitest';
import { mulberry32, range, shuffle } from './rng';
import { neighbors4, isAdjacent8 } from './grid';
import { randomSolution, growRegions, passesQualityGates } from './generator';
import { countSolutions, firstSolution, countSolutionsBrute } from './solver';
import { generateUniquePuzzle } from './uniqueness';
import { planEasier, lineRegionThreshold, countOneLineRegions } from './easier';
import { assignRegionColors } from './palette';
import { computeHint } from './hint';
import { computeAutoX, computeConflicts, isSolved, rowColPlan } from './autoblock';

// ---- helpers --------------------------------------------------------------

function isValidSolution(p: number[], n: number): boolean {
  if (p.length !== n) return false;
  if (new Set(p).size !== n) return false; // permutation (one per column)
  for (const c of p) if (c < 0 || c >= n) return false;
  for (let r = 0; r < n - 1; r++) if (Math.abs(p[r] - p[r + 1]) < 2) return false;
  return true;
}

/** Full king's-move check over all crown pairs (ground truth for adjacency). */
function noKingAdjacency(p: number[], n: number): boolean {
  const cells = p.map((c, r) => r * n + c);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (isAdjacent8(cells[i], cells[j], n)) return false;
    }
  }
  return true;
}

function regionSizes(regionOf: ArrayLike<number>, n: number): number[] {
  const size = new Array<number>(n).fill(0);
  for (let i = 0; i < regionOf.length; i++) size[regionOf[i]]++;
  return size;
}

function regionContiguous(regionOf: ArrayLike<number>, n: number, g: number, size: number): boolean {
  let start = -1;
  for (let i = 0; i < regionOf.length; i++) {
    if (regionOf[i] === g) {
      start = i;
      break;
    }
  }
  if (start === -1) return size === 0;
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of neighbors4(cur, n)) {
      if (regionOf[nb] === g && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === size;
}

// ---- RNG ------------------------------------------------------------------

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('shuffle produces a permutation', () => {
    const rng = mulberry32(7);
    const arr = shuffle(range(20), rng);
    expect(new Set(arr).size).toBe(20);
    expect([...arr].sort((x, y) => x - y)).toEqual(range(20));
  });
});

// ---- solution generation --------------------------------------------------

describe('randomSolution', () => {
  it('produces a valid non-attacking placement for every N in 8..15', () => {
    for (let n = 8; n <= 15; n++) {
      for (let s = 0; s < 40; s++) {
        const p = randomSolution(n, mulberry32(n * 1000 + s));
        expect(p).not.toBeNull();
        expect(isValidSolution(p!, n)).toBe(true);
      }
    }
  });
});

// ---- adjacency reduction proof -------------------------------------------

describe('adjacency reduction', () => {
  it('|p[r]-p[r+1]|>=2 is equivalent to full king-move non-adjacency', () => {
    const n = 12;
    const rng = mulberry32(99);
    for (let t = 0; t < 2000; t++) {
      const p = shuffle(range(n), rng); // arbitrary permutation
      const consecutiveOk = (() => {
        for (let r = 0; r < n - 1; r++) if (Math.abs(p[r] - p[r + 1]) < 2) return false;
        return true;
      })();
      expect(consecutiveOk).toBe(noKingAdjacency(p, n));
    }
  });
});

// ---- region growth --------------------------------------------------------

describe('growRegions', () => {
  it('partitions the board into N contiguous regions, one crown each', () => {
    for (let n = 8; n <= 15; n++) {
      for (let s = 0; s < 15; s++) {
        const rng = mulberry32(n * 31 + s);
        const sol = randomSolution(n, rng)!;
        const regionOf = growRegions(n, sol, rng);

        // full partition
        for (let i = 0; i < n * n; i++) {
          expect(regionOf[i]).toBeGreaterThanOrEqual(0);
          expect(regionOf[i]).toBeLessThan(n);
        }
        const sizes = regionSizes(regionOf, n);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n * n);

        // contiguity
        for (let g = 0; g < n; g++) {
          expect(regionContiguous(regionOf, n, g, sizes[g])).toBe(true);
        }

        // exactly one solution crown per region
        const crownPerRegion = new Array<number>(n).fill(0);
        for (let r = 0; r < n; r++) crownPerRegion[regionOf[r * n + sol[r]]]++;
        expect(crownPerRegion.every((c) => c === 1)).toBe(true);
      }
    }
  });
});

// ---- uniqueness / generation ---------------------------------------------

describe('generateUniquePuzzle', () => {
  it('produces uniquely-solvable puzzles whose answer is the embedded solution', () => {
    for (let n = 8; n <= 15; n++) {
      const puz = generateUniquePuzzle(mulberry32(n * 7 + 1), 1, { fixedN: n });
      expect(puz.n).toBe(n);
      expect(isValidSolution(puz.solution, n)).toBe(true);
      expect(passesQualityGates(puz.regionOf, n)).toBe(true);

      // exactly one solution (brute force, no early exit)
      expect(countSolutions(n, puz.regionOf, 999)).toBe(1);
      // and it is the embedded solution
      expect(firstSolution(n, puz.regionOf)).toEqual(puz.solution);
    }
  }, 30_000);

  it('is deterministic for a given seed + id', () => {
    const a = generateUniquePuzzle(mulberry32(42), 5);
    const b = generateUniquePuzzle(mulberry32(42), 5);
    expect(a).toEqual(b);
  }, 20_000);

  it('randomizes board size across the 8..15 range', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 24; s++) seen.add(generateUniquePuzzle(mulberry32(s + 500), s).n);
    // not asserting all sizes (probabilistic), but it must vary
    expect(seen.size).toBeGreaterThan(2);
    for (const n of seen) expect(n >= 8 && n <= 15).toBe(true);
  }, 30_000);
});

// ---- solver cross-check ---------------------------------------------------

describe('solver', () => {
  it('propagation count matches the independent brute solver (small N)', () => {
    for (let n = 8; n <= 9; n++) {
      for (let s = 0; s < 20; s++) {
        const rng = mulberry32(n * 17 + s);
        const sol = randomSolution(n, rng)!;
        const regionOf = growRegions(n, sol, rng); // usually many solutions
        const cap = 5;
        expect(countSolutions(n, regionOf, cap)).toBe(countSolutionsBrute(n, regionOf, cap));
      }
    }
  });
});

// ---- auto-block overlay + row/col feature ---------------------------------

describe('autoblock', () => {
  // 4x4, region layout:
  //   0 0 1 1
  //   2 2 1 1
  //   2 2 3 3
  //   0 0 3 3
  const n = 4;
  const regionOf = [0, 0, 1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 0, 0, 3, 3];

  it('computeAutoX covers row, column, region and neighbors of a crown', () => {
    const crown = 5; // (row 1, col 1), region 2
    const ax = computeAutoX(n, regionOf, new Set([crown]));
    expect(ax.has(crown)).toBe(false); // never the crown itself
    expect(ax.has(4)).toBe(true); // same row
    expect(ax.has(1)).toBe(true); // same column
    expect(ax.has(8)).toBe(true); // same region (cell 8 is region 2)
    expect(ax.has(0)).toBe(true); // diagonal neighbor
    expect(ax.has(11)).toBe(false); // unrelated cell (r2c3: diff row/col/region, not adjacent)
  });

  it('computeConflicts flags crowns that share a row', () => {
    const c = computeConflicts(n, regionOf, new Set([0, 3])); // both row 0
    expect(c.has(0)).toBe(true);
    expect(c.has(3)).toBe(true);
  });

  it('isSolved is true only for a complete, valid placement', () => {
    // p = [1,3,0,2]: one per row/col/region, |p[r]-p[r+1]|>=2 (no adjacency).
    const good = new Set([1 /*r0c1*/, 7 /*r1c3*/, 8 /*r2c0*/, 14 /*r3c2*/]);
    expect(isSolved(n, regionOf, good)).toBe(true);
    expect(isSolved(n, regionOf, new Set([1, 7, 8]))).toBe(false); // incomplete
  });

  it('rowColPlan blocks the rest of a row when a region is row-confined', () => {
    // Block region 0's lower cells (12,13) so its open cells are just row 0 {0,1}.
    const plan = rowColPlan(n, regionOf, 0, new Set(), new Set([12, 13]));
    expect(plan).not.toBeNull();
    expect(plan!.axis).toBe('row');
    expect(plan!.line).toBe(0);
    expect(plan!.targets.sort((a, b) => a - b)).toEqual([2, 3]); // other-region cells in row 0
  });

  it('rowColPlan is null when a region is not line-confined', () => {
    expect(rowColPlan(n, regionOf, 0, new Set(), new Set())).toBeNull(); // region 0 spans rows 0 and 3
  });
});

// ---- hint engine ----------------------------------------------------------

describe('computeHint', () => {
  it('always suggests a solution crown and drives a full solve', () => {
    for (let n = 8; n <= 12; n++) {
      const puz = generateUniquePuzzle(mulberry32(n * 23 + 4), 1, { fixedN: n });
      const crowns = new Set<number>();
      for (let step = 0; step <= n; step++) {
        const h = computeHint(n, puz.regionOf, puz.solution, crowns, new Set(), true);
        if (crowns.size === n) {
          expect(h).toBeNull();
          break;
        }
        expect(h).not.toBeNull();
        expect(h!.kind).toBe('place-crown');
        // the suggested cell is genuinely the solution's crown for its row
        const cell = (h as { cell: number }).cell;
        expect(puz.solution[(cell / n) | 0]).toBe(cell % n);
        crowns.add(cell);
      }
      expect(crowns.size).toBe(n);
    }
  }, 20_000);

  it('still suggests a valid crown placement when a wrong crown is present', () => {
    const n = 9;
    const puz = generateUniquePuzzle(mulberry32(123), 1, { fixedN: n });
    let wrong = -1;
    for (let i = 0; i < n * n; i++) {
      if (puz.solution[(i / n) | 0] !== i % n) {
        wrong = i;
        break;
      }
    }
    const h = computeHint(n, puz.regionOf, puz.solution, new Set([wrong]), new Set(), true);
    expect(h?.kind).toBe('place-crown');
    const cell = (h as { cell: number }).cell;
    expect(puz.solution[(cell / n) | 0]).toBe(cell % n); // a real solution crown
  });
});

// ---- palette / coloring ---------------------------------------------------

describe('assignRegionColors', () => {
  it('gives every region a distinct color (no two regions share one)', () => {
    const paletteSize = 16;
    for (let n = 8; n <= 15; n++) {
      const rng = mulberry32(n * 13 + 3);
      const puz = generateUniquePuzzle(rng, 1, { fixedN: n });
      const colors = assignRegionColors(n, puz.regionOf, paletteSize, rng);
      expect(colors.length).toBe(n);
      for (const c of colors) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(paletteSize);
      }
      // distinct colors → also guarantees no adjacent region shares a color
      expect(new Set(colors).size).toBe(n);
    }
  }, 30_000);
});

// ---- easier mode ----------------------------------------------------------

/**
 * Independent (test-side) one-line region count: a region is "one-line" iff all
 * its cells share a single row OR a single column. Deliberately NOT the
 * production `countOneLineRegions`, so it is ground truth for the guarantee.
 */
function oneLineCountIndependent(regionOf: ArrayLike<number>, n: number): number {
  const cellsByRegion: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < regionOf.length; i++) cellsByRegion[regionOf[i]].push(i);
  let count = 0;
  for (let g = 0; g < n; g++) {
    const cells = cellsByRegion[g];
    if (cells.length === 0) continue;
    const rows = new Set(cells.map((i) => (i / n) | 0));
    const cols = new Set(cells.map((i) => i % n));
    if (rows.size === 1 || cols.size === 1) count++;
  }
  return count;
}

describe('easier mode', () => {
  it('lineRegionThreshold matches the size bands (10 sits in the stricter band)', () => {
    expect([8, 9].map(lineRegionThreshold)).toEqual([2, 2]);
    expect([10, 11, 12].map(lineRegionThreshold)).toEqual([3, 3, 3]);
    expect([13, 14, 15].map(lineRegionThreshold)).toEqual([4, 4, 4]);
  });

  it('planEasier picks threshold(n) line-regions with distinct, on-line, in-bounds preclaims', () => {
    for (let n = 8; n <= 15; n++) {
      for (let s = 0; s < 30; s++) {
        const rng = mulberry32(n * 101 + s);
        const sol = randomSolution(n, rng)!;
        const plan = planEasier(n, sol, rng);
        expect(plan.lineRegions.length).toBe(lineRegionThreshold(n));

        const seenCells = new Set<number>();
        const seenRegions = new Set<number>();
        for (const spec of plan.lineRegions) {
          expect(seenRegions.has(spec.region)).toBe(false); // distinct regions
          seenRegions.add(spec.region);
          expect(seenCells.has(spec.preclaim)).toBe(false); // distinct preclaims (row×col crossing guard)
          seenCells.add(spec.preclaim);
          expect(spec.preclaim).toBeGreaterThanOrEqual(0);
          expect(spec.preclaim).toBeLessThan(n * n);
          // preclaim lies on the region's confined line; seed shares that line
          if (spec.axis === 'row') {
            expect((spec.preclaim / n) | 0).toBe(spec.line);
            expect(spec.line).toBe(spec.region); // region r is seeded in row r
          } else {
            expect(spec.preclaim % n).toBe(spec.line);
            expect(sol[spec.region]).toBe(spec.line); // seed column
          }
          // mirror lookup arrays agree with the spec
          expect(plan.isLineRegion[spec.region]).toBe(1);
          expect(plan.lineAxisOf[spec.region]).toBe(spec.axis === 'row' ? 0 : 1);
          expect(plan.lineIndexOf[spec.region]).toBe(spec.line);
        }
      }
    }
  });

  it('growRegions(plan) keeps planned regions one-line within target; complete maps partition cleanly', () => {
    let completeMaps = 0;
    const RUNS = 8 * 12;
    for (let n = 8; n <= 15; n++) {
      for (let s = 0; s < 12; s++) {
        const rng = mulberry32(n * 53 + s);
        const sol = randomSolution(n, rng)!;
        const plan = planEasier(n, sol, rng);
        const regionOf = growRegions(n, sol, rng, plan);

        // ALWAYS true: each planned line-region is confined to its line and its
        // length is in [2, targetLen] (pre-claim floor, freeze ceiling).
        for (const spec of plan.lineRegions) {
          let len = 0;
          for (let i = 0; i < n * n; i++) {
            if (regionOf[i] !== spec.region) continue;
            len++;
            if (spec.axis === 'row') expect((i / n) | 0).toBe(spec.line);
            else expect(i % n).toBe(spec.line);
          }
          expect(len).toBeGreaterThanOrEqual(2);
          expect(len).toBeLessThanOrEqual(plan.targetLen[spec.region]);
        }

        // A long strip can rarely ring a pocket → some cells UNASSIGNED; that map
        // is regrown by uniqueness.ts. When a map IS complete, it must be a valid
        // partition with every region >= 2 and the one-line guarantee met.
        if (![...regionOf].every((g) => g < n)) continue;
        completeMaps++;
        const sizes = regionSizes(regionOf, n);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n * n);
        for (let g = 0; g < n; g++) {
          expect(sizes[g]).toBeGreaterThanOrEqual(2);
          expect(regionContiguous(regionOf, n, g, sizes[g])).toBe(true);
        }
        expect(oneLineCountIndependent(regionOf, n)).toBeGreaterThanOrEqual(lineRegionThreshold(n));
      }
    }
    // Incompleteness must be RARE — the vast majority of single grows are usable.
    expect(completeMaps).toBeGreaterThan(RUNS * 0.8);
  });

  it('generateUniquePuzzle(easier) is uniquely solvable AND meets the one-line guarantee for N=8..15', () => {
    for (let n = 8; n <= 15; n++) {
      const puz = generateUniquePuzzle(mulberry32(n * 7 + 1), 1, { fixedN: n, easier: true });
      expect(puz.n).toBe(n);
      expect(isValidSolution(puz.solution, n)).toBe(true);
      expect(passesQualityGates(puz.regionOf, n)).toBe(true);
      // unique solution (brute, no early exit) and it is the embedded solution
      expect(countSolutions(n, puz.regionOf, 999)).toBe(1);
      expect(firstSolution(n, puz.regionOf)).toEqual(puz.solution);
      // the easier-mode guarantee, by ground-truth count, survives carving
      expect(oneLineCountIndependent(puz.regionOf, n)).toBeGreaterThanOrEqual(lineRegionThreshold(n));
      // production counter agrees with ground truth
      expect(countOneLineRegions(puz.regionOf, n)).toBe(oneLineCountIndependent(puz.regionOf, n));
    }
  }, 40_000);

  it('is deterministic for a given seed + id in easier mode', () => {
    const a = generateUniquePuzzle(mulberry32(42), 5, { easier: true });
    const b = generateUniquePuzzle(mulberry32(42), 5, { easier: true });
    expect(a).toEqual(b);
  }, 20_000);
});
