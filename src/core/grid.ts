/**
 * grid.ts — index <-> {row, col} conversions and neighbor helpers.
 * Cell index convention: i = row * n + col.
 */

export function idx(row: number, col: number, n: number): number {
  return row * n + col;
}

export function rowOf(i: number, n: number): number {
  return (i / n) | 0;
}

export function colOf(i: number, n: number): number {
  return i % n;
}

/** Orthogonal neighbors (up/down/left/right) that are in bounds. */
export function neighbors4(i: number, n: number): number[] {
  const r = (i / n) | 0;
  const c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

/** King's-move neighbors (the 8 surrounding cells) that are in bounds. */
export function neighbors8(i: number, n: number): number[] {
  const r = (i / n) | 0;
  const c = i % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
  }
  return out;
}

/** True if cells a and b are king's-move adjacent (share an edge or corner). */
export function isAdjacent8(a: number, b: number, n: number): boolean {
  const dr = Math.abs(((a / n) | 0) - ((b / n) | 0));
  const dc = Math.abs((a % n) - (b % n));
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}
