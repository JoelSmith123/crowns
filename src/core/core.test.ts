import { describe, it, expect } from 'vitest';
import { mulberry32, range, shuffle } from './rng';
import { neighbors4, isAdjacent8 } from './grid';
import { randomSolution, growRegions, passesQualityGates } from './generator';
import { countSolutions, firstSolution, countSolutionsBrute } from './solver';
import { generateUniquePuzzle } from './uniqueness';
import { assignRegionColors, buildRegionAdjacency } from './palette';
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
  it('always returns solution-consistent hints that drive a full solve', () => {
    for (let n = 8; n <= 12; n++) {
      const puz = generateUniquePuzzle(mulberry32(n * 23 + 4), 1, { fixedN: n });
      const solByRegion = new Array<number>(n);
      for (let r = 0; r < n; r++) solByRegion[puz.regionOf[r * n + puz.solution[r]]] = r * n + puz.solution[r];

      const crowns = new Set<number>();
      const manualX = new Set<number>();
      for (let step = 0; step <= n; step++) {
        const h = computeHint(n, puz.regionOf, puz.solution, crowns, manualX, true);
        if (crowns.size === n) {
          expect(h).toBeNull();
          break;
        }
        expect(h).not.toBeNull();
        if (h!.kind === 'place-crown') {
          // the suggested cell is genuinely the solution's crown for its row
          expect(puz.solution[(h!.cell / n) | 0]).toBe(h!.cell % n);
          crowns.add(h!.cell);
        } else if (h!.kind === 'region-line') {
          crowns.add(solByRegion[h!.region]); // advance by taking that region's crown
        } else {
          throw new Error(`unexpected hint kind on a consistent board: ${h!.kind}`);
        }
      }
      expect(crowns.size).toBe(n);
    }
  }, 20_000);

  it('flags a wrongly placed crown as a mistake', () => {
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
    expect(h?.reason).toBe('mistake');
  });
});

// ---- palette / coloring ---------------------------------------------------

describe('assignRegionColors', () => {
  it('never gives adjacent regions the same color', () => {
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
      const adj = buildRegionAdjacency(n, puz.regionOf);
      for (let g = 0; g < n; g++) {
        for (const h of adj[g]) expect(colors[g]).not.toBe(colors[h]);
      }
    }
  }, 30_000);
});
