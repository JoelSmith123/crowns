/**
 * types.ts — shared, pure data types for the game core. Safe to import from the
 * worker and the main thread. No DOM, no behavior.
 *
 * Coordinate convention: a cell is a single index `i = row * n + col`. Conversion
 * to {row, col} happens only at boundaries (see grid.ts).
 */

/**
 * A fully generated puzzle. `solution` is the unique answer and stays in the
 * worker — it is never sent to the main thread (see worker/protocol.ts).
 */
export interface GeneratedPuzzle {
  id: number;
  n: number;
  /** length n*n; region id (0..n-1) for each cell. */
  regionOf: number[];
  /** length n; solution[row] = column of that row's crown. */
  solution: number[];
}

/** What the UI receives — the puzzle minus its solution. */
export interface PuzzleView {
  id: number;
  n: number;
  regionOf: number[];
}

/** Render state of a cell. Derived from explicit player state + settings. */
export const Mark = {
  Empty: 0,
  Crown: 1,
  /** Auto-placed block (derived from crowns; only when auto-block is on). */
  AutoX: 2,
  /** Block the player placed explicitly. */
  ManualX: 3,
} as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export type HintReason =
  | 'region-single'
  | 'row-single'
  | 'col-single'
  | 'region-line'
  | 'forced-block'
  | 'hidden-single'
  | 'solution-fallback'
  | 'mistake';

/**
 * A non-destructive hint. The UI highlights the target(s); it never mutates the
 * board, so hints stay out of the undo stack.
 */
export type Hint =
  | { kind: 'place-crown'; cell: number; reason: HintReason }
  | { kind: 'block-cell'; cell: number; reason: HintReason }
  | { kind: 'region-line'; region: number; axis: 'row' | 'col'; line: number; cells: number[]; reason: HintReason }
  | { kind: 'focus-region'; region: number; cell: number; reason: HintReason };

/** Result of evaluating the row/column auto-block feature for a region. */
export interface RowColPlan {
  region: number;
  axis: 'row' | 'col';
  /** Row index (axis==='row') or column index (axis==='col'). */
  line: number;
  /** Cells to block (other regions' open cells along the line). */
  targets: number[];
}
