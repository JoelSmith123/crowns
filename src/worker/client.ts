/**
 * client.ts — main-thread wrapper around the puzzle worker.
 *
 * `generate()` is promise-based (correlated by reqId). Hints are a push channel
 * (the worker recomputes after each board change); the store registers a handler
 * and guards stale replies by puzzle id.
 */
import PuzzleWorker from './puzzle.worker.ts?worker';
import type { Req, Res } from './protocol';
import type { Hint } from '../core/types';

export interface PuzzleData {
  id: number;
  n: number;
  regionOf: number[];
}

export class WorkerClient {
  private worker: Worker;
  private reqId = 0;
  private genResolvers = new Map<number, (p: PuzzleData) => void>();
  private regionResolvers = new Map<number, (cell: number | null) => void>();
  private hintHandler: ((puzzleId: number, hint: Hint | null) => void) | null = null;

  constructor() {
    this.worker = new PuzzleWorker();
    this.worker.onmessage = (ev: MessageEvent<Res>) => this.onMessage(ev.data);
  }

  /** Generate a fresh, uniquely-solvable puzzle (easier mode applies its extra guarantees). */
  generate(easier: boolean): Promise<PuzzleData> {
    const reqId = ++this.reqId;
    return new Promise((resolve) => {
      this.genResolvers.set(reqId, resolve);
      this.post({ type: 'GENERATE', reqId, easier });
    });
  }

  /** Ask the worker to (re)compute the next hint for the current board. */
  computeHint(puzzleId: number, crowns: number[], manualX: number[], autoBlock: boolean): void {
    this.post({ type: 'COMPUTE_HINT', reqId: ++this.reqId, puzzleId, crowns, manualX, autoBlock });
  }

  /** Block Hint: resolve the solution's crown cell for one region (null if the puzzle is unknown). */
  revealRegion(puzzleId: number, region: number): Promise<number | null> {
    const reqId = ++this.reqId;
    return new Promise((resolve) => {
      this.regionResolvers.set(reqId, resolve);
      this.post({ type: 'REVEAL_REGION', reqId, puzzleId, region });
    });
  }

  /** Register the hint push handler (latest wins). */
  onHint(handler: (puzzleId: number, hint: Hint | null) => void): void {
    this.hintHandler = handler;
  }

  private post(req: Req): void {
    this.worker.postMessage(req);
  }

  private onMessage(res: Res): void {
    switch (res.type) {
      case 'GENERATED': {
        const resolve = this.genResolvers.get(res.reqId);
        if (resolve) {
          this.genResolvers.delete(res.reqId);
          resolve(res.puzzle);
        }
        break;
      }
      case 'HINT': {
        this.hintHandler?.(res.puzzleId, res.hint);
        break;
      }
      case 'REGION_CROWN': {
        const resolve = this.regionResolvers.get(res.reqId);
        if (resolve) {
          this.regionResolvers.delete(res.reqId);
          resolve(res.cell);
        }
        break;
      }
      case 'ERROR': {
        // eslint-disable-next-line no-console
        console.error('[worker]', res.message);
        break;
      }
    }
  }
}
