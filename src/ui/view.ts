/**
 * view.ts — top-level layout. Board centered; small controls hug it on the
 * left/right; the large New Puzzle button sits centered below. Also wires global
 * keyboard shortcuts.
 */
import { effect } from '../state/signal';
import type { GameStore } from '../state/store';
import { createBoard } from './board';
import { createControls } from './controls';
import { createWinOverlay } from './winOverlay';
import { attachBoardInput } from './input';

export function mountApp(root: HTMLElement, store: GameStore): void {
  const shell = document.createElement('div');
  shell.className = 'shell';

  const title = document.createElement('h1');
  title.className = 'wordmark';
  title.textContent = 'Crowns';

  const controls = createControls(store);
  const board = createBoard(store);
  const win = createWinOverlay(store);

  const boardWrap = document.createElement('div');
  boardWrap.className = 'board-wrap';
  boardWrap.append(board.el, win.el);

  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.append(controls.left, boardWrap, controls.right);

  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `<span class="loading__dot"></span>Generating a puzzle…`;
  effect(() => loading.classList.toggle('loading--show', store.status.get() === 'loading'));

  shell.append(title, stage, controls.newPuzzle, loading);
  root.replaceChildren(shell);

  attachBoardInput(board.el, store);
  attachShortcuts(store);
}

function attachShortcuts(store: GameStore): void {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 'z') {
      e.preventDefault();
      store.undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (key === 'h') store.showHint();
    else if (key === 'b') store.toggleCursorMode();
    else if (key === 'a') store.toggleAutoBlock();
  });
}
