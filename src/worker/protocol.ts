/**
 * protocol.ts — the typed message contract between the main thread and the
 * puzzle worker. Imported by both sides. Every message carries a monotonic
 * `reqId`; puzzle-scoped messages also carry `puzzleId` so the main thread can
 * drop stale replies after the board has moved on.
 *
 * The solution never crosses this boundary: GENERATED sends only what the UI
 * needs to render, and the worker answers hints itself from the solution it
 * keeps privately.
 */
import type { Hint } from '../core/types';

// ---- main -> worker -------------------------------------------------------

export interface GenerateReq {
  type: 'GENERATE';
  reqId: number;
}

export interface ComputeHintReq {
  type: 'COMPUTE_HINT';
  reqId: number;
  puzzleId: number;
  crowns: number[];
  manualX: number[];
  autoBlock: boolean;
}

export type Req = GenerateReq | ComputeHintReq;

// ---- worker -> main -------------------------------------------------------

export interface GeneratedRes {
  type: 'GENERATED';
  reqId: number;
  puzzle: {
    id: number;
    n: number;
    regionOf: number[];
  };
}

export interface HintRes {
  type: 'HINT';
  reqId: number;
  puzzleId: number;
  hint: Hint | null;
}

export interface ErrorRes {
  type: 'ERROR';
  reqId: number;
  message: string;
}

export type Res = GeneratedRes | HintRes | ErrorRes;
