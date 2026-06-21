/**
 * puzzle.worker.ts — runs all heavy compute off the main thread.
 *
 * Owns the RNG and the solutions: it generates puzzles and answers hints from
 * the solution it keeps privately, so the answer never reaches the main thread.
 *
 * `self` is typed via a minimal cast to avoid the DOM-vs-WebWorker lib clash
 * (the app tsconfig uses the DOM lib).
 */
import type { Req, Res } from './protocol';
import { generateUniquePuzzle } from '../core/uniqueness';
import { mulberry32, randomSeed } from '../core/rng';
import type { Rng } from '../core/rng';

const ctx = self as unknown as {
  postMessage(message: Res): void;
  onmessage: ((ev: MessageEvent<Req>) => void) | null;
};

const rng: Rng = mulberry32(randomSeed());
let nextId = 1;

interface StoredPuzzle {
  n: number;
  regionOf: number[];
  solution: number[];
}
const puzzles = new Map<number, StoredPuzzle>();
const MAX_KEPT = 6;

function handle(req: Req): void {
  switch (req.type) {
    case 'GENERATE': {
      const puz = generateUniquePuzzle(rng, nextId++);
      puzzles.set(puz.id, { n: puz.n, regionOf: puz.regionOf, solution: puz.solution });
      if (puzzles.size > MAX_KEPT) {
        const oldest = puzzles.keys().next().value;
        if (oldest !== undefined) puzzles.delete(oldest);
      }
      ctx.postMessage({
        type: 'GENERATED',
        reqId: req.reqId,
        puzzle: { id: puz.id, n: puz.n, regionOf: puz.regionOf },
      });
      break;
    }
    case 'COMPUTE_HINT': {
      // Real deduction ladder arrives in M7; until then there is no hint.
      ctx.postMessage({ type: 'HINT', reqId: req.reqId, puzzleId: req.puzzleId, hint: null });
      break;
    }
  }
}

ctx.onmessage = (ev) => handle(ev.data);
