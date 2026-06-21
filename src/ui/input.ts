/**
 * input.ts — pointer & hover handling for the board (event delegation).
 *
 * Single vs double click: we detect double-click manually (two clicks on the
 * same cell) instead of the native event, so single actions are responsive.
 * A pending single click is flushed immediately when a *different* cell is
 * clicked, so rapid multi-cell placement never feels laggy; only a lone final
 * click waits out the double-click window.
 */
import type { GameStore } from '../state/store';

const DOUBLE_MS = 200;

function cellIndex(target: EventTarget | null): number {
  if (!(target instanceof Element)) return -1;
  const cell = target.closest('.cell') as HTMLElement | null;
  if (!cell || cell.dataset.i === undefined) return -1;
  return Number(cell.dataset.i);
}

function cellRegion(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest('.cell') as HTMLElement | null;
  if (!cell || cell.dataset.region === undefined) return null;
  return Number(cell.dataset.region);
}

export function attachBoardInput(board: HTMLElement, store: GameStore): () => void {
  let pending: { cell: number; timer: ReturnType<typeof setTimeout> } | null = null;

  function flushPending(): void {
    if (!pending) return;
    clearTimeout(pending.timer);
    const cell = pending.cell;
    pending = null;
    store.clickCell(cell);
  }

  function onClick(e: MouseEvent): void {
    const cell = cellIndex(e.target);
    if (cell < 0) return;
    if (pending && pending.cell === cell) {
      // second click on the same cell → double click
      clearTimeout(pending.timer);
      pending = null;
      store.doubleClickCell(cell);
      return;
    }
    flushPending(); // a different cell — commit the previous single now
    pending = {
      cell,
      timer: setTimeout(() => {
        pending = null;
        store.clickCell(cell);
      }, DOUBLE_MS),
    };
  }

  function onPointerOver(e: PointerEvent): void {
    const region = cellRegion(e.target);
    if (region !== null) store.setHover(region);
  }

  function onPointerLeave(): void {
    store.setHover(null);
  }

  // Right-click toggles a block (convenience, matches the original game).
  function onContextMenu(e: MouseEvent): void {
    const cell = cellIndex(e.target);
    if (cell < 0) return;
    e.preventDefault();
    flushPending();
    store.blockAt(cell);
  }

  board.addEventListener('click', onClick);
  board.addEventListener('pointerover', onPointerOver);
  board.addEventListener('pointerleave', onPointerLeave);
  board.addEventListener('contextmenu', onContextMenu);

  return () => {
    board.removeEventListener('click', onClick);
    board.removeEventListener('pointerover', onPointerOver);
    board.removeEventListener('pointerleave', onPointerLeave);
    board.removeEventListener('contextmenu', onContextMenu);
    if (pending) clearTimeout(pending.timer);
  };
}
