import { describe, it, expect } from 'vitest';
import { mulberry32, randInt } from './rng';
import { generateUniquePuzzle } from './uniqueness';
import { countSolutions } from './solver';

/**
 * Generation runs in a Web Worker with the next puzzle preloaded during play, so
 * the player never waits on it. These checks prioritise correctness (every
 * puzzle is uniquely solvable) and guard against a catastrophic perf regression
 * with a generous ceiling — exact timings are noisy across machines/load.
 */
describe('generation across the real size range (8..15)', () => {
  it('always produces uniquely-solvable puzzles, reasonably fast', () => {
    const RUNS = 30;
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const rng = mulberry32(20_000 + i);
      const n = randInt(rng, 8, 15);
      const t0 = performance.now();
      const puz = generateUniquePuzzle(rng, i, { fixedN: n });
      times.push(performance.now() - t0);
      expect(countSolutions(n, puz.regionOf, 2)).toBe(1); // exactly one solution
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(RUNS * 0.5)];
    const p90 = times[Math.floor(RUNS * 0.9)];
    // eslint-disable-next-line no-console
    console.log(`generation ms — p50=${p50.toFixed(1)} p90=${p90.toFixed(1)}`);
    // Generous ceiling (machine/load noise): catches an O(blow-up) regression.
    expect(p50).toBeLessThan(800);
  }, 90_000);
});

/**
 * Easier mode must NOT cost extra generation work: the one-line guarantee is
 * construction-based, and one-line regions reduce alternates, so grow+carve
 * attempt counts should be at parity with normal (load-independent metric — the
 * dev machine's wall-clock is inflated ~3–4×, so we assert attempts, not ms).
 */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.5)];
}
function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

describe('easier-mode generation (8..15)', () => {
  it('stays uniquely solvable without inflating attempt counts vs normal', () => {
    const RUNS = 30;
    const easierAttempts: number[] = [];
    const normalAttempts: number[] = [];
    const easierTimes: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const n = randInt(mulberry32(30_000 + i), 8, 15);

      let ea = 0;
      const t0 = performance.now();
      const puz = generateUniquePuzzle(mulberry32(30_000 + i), i, {
        fixedN: n,
        easier: true,
        onStats: (s) => (ea = s.growAttempts),
      });
      easierTimes.push(performance.now() - t0);
      easierAttempts.push(ea);
      expect(countSolutions(n, puz.regionOf, 2)).toBe(1); // exactly one solution

      let na = 0;
      generateUniquePuzzle(mulberry32(30_000 + i), i, { fixedN: n, onStats: (s) => (na = s.growAttempts) });
      normalAttempts.push(na);
    }
    easierTimes.sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log(
      `easier attempts — p50=${median(easierAttempts)} p90=${pct(easierAttempts, 0.9)} max=${Math.max(...easierAttempts)} | ` +
        `normal attempts — p50=${median(normalAttempts)} p90=${pct(normalAttempts, 0.9)} | ` +
        `easier ms p50=${easierTimes[Math.floor(RUNS * 0.5)].toFixed(1)}`,
    );
    // Construction-based: median attempts at parity with normal, tail bounded (no
    // rejection-sampling blow-up — a regression there spiked p90 past 100).
    expect(median(easierAttempts)).toBeLessThanOrEqual(median(normalAttempts) + 2);
    expect(pct(easierAttempts, 0.9)).toBeLessThan(40);
  }, 120_000);
});
