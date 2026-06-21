/**
 * winOverlay.ts — tasteful, minimal win indication. A small "Solved" badge over
 * the board border; the board itself gets a soft gold glow via a body class.
 */
import { effect } from '../state/signal';
import type { GameStore } from '../state/store';

export interface WinView {
  el: HTMLElement;
  dispose: () => void;
}

export function createWinOverlay(store: GameStore): WinView {
  const el = document.createElement('div');
  el.className = 'win';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<span class="win__badge">Solved</span>`;

  const dispose = effect(() => {
    const won = store.status.get() === 'won';
    el.classList.toggle('win--show', won);
  });

  return { el, dispose };
}
