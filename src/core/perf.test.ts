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
