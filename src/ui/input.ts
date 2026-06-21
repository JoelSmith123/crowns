/**
 * input.ts — pointer & hover handling for the board (event delegation).
 *
 * Single vs double click uses the browser's native click count (`event.detail`)
 * rather than a manual timer: the first click acts immediately (no lag), and a
 * genuine double-click (detail === 2, using the OS double-click threshold) undoes
 * that first single action and performs the double action instead. This makes
 * single clicks instant and double-clicks reliable.
 */
import type { GameStore } from '../state/store';

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
  // Tracks whether the previous click executed the armed row/column feature, so
  // a trailing second click doesn't undo it.
  let lastWasFeature = false;

  function onClick(e: MouseEvent): void {
    const cell = cellIndex(e.target);
    if (cell < 0) return;

    if (store.rowColArmed.peek()) {
      store.clickCell(cell); // execute the feature on this region
      lastWasFeature = true;
      return;
    }

    if (e.detail === 2 && !lastWasFeature) {
      // Second click of a double-click: revert the first click's single action,
      // then perform the double action (the opposite of the current mode).
      store.undo();
      store.doubleClickCell(cell);
    } else {
      store.clickCell(cell); // instant single action
    }
    lastWasFeature = false;
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
    store.blockAt(cell);
  }

  // Keyboard: arrow keys move a roving focus; Enter/Space act per cursor mode,
  // X toggles a block, C crowns.
  function onKeyDown(e: KeyboardEvent): void {
    const i = cellIndex(e.target);
    if (i < 0) return;
    const p = store.puzzle.peek();
    if (!p) return;
    const n = p.n;
    const row = (i / n) | 0;
    const col = i % n;
    let target = i;
    switch (e.key) {
      case 'ArrowRight': target = col < n - 1 ? i + 1 : i; break;
      case 'ArrowLeft': target = col > 0 ? i - 1 : i; break;
      case 'ArrowUp': target = row > 0 ? i - n : i; break;
      case 'ArrowDown': target = row < n - 1 ? i + n : i; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        store.clickCell(i);
        return;
      case 'x':
      case 'X':
        e.preventDefault();
        store.blockAt(i);
        return;
      case 'c':
      case 'C':
        e.preventDefault();
        store.crownAt(i);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (target !== i) {
      const cur = board.querySelector<HTMLElement>(`.cell[data-i="${i}"]`);
      const next = board.querySelector<HTMLElement>(`.cell[data-i="${target}"]`);
      if (cur && next) {
        cur.tabIndex = -1;
        next.tabIndex = 0;
        next.focus();
      }
    }
  }

  board.addEventListener('click', onClick);
  board.addEventListener('pointerover', onPointerOver);
  board.addEventListener('pointerleave', onPointerLeave);
  board.addEventListener('contextmenu', onContextMenu);
  board.addEventListener('keydown', onKeyDown);

  return () => {
    board.removeEventListener('click', onClick);
    board.removeEventListener('pointerover', onPointerOver);
    board.removeEventListener('pointerleave', onPointerLeave);
    board.removeEventListener('contextmenu', onContextMenu);
    board.removeEventListener('keydown', onKeyDown);
  };
}
