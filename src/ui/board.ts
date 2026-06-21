/**
 * board.ts — the CSS-Grid board. Cells are built once per puzzle; reactive
 * effects patch only what changed (marks diffed against a cached copy, plus
 * class toggles for conflicts, region hover, hint and feature highlights).
 */
import { effect } from '../state/signal';
import type { GameStore, ActivePuzzle } from '../state/store';
import { Mark } from '../core/types';
import { crownSvg, xSvg } from './icons';

export interface BoardView {
  el: HTMLElement;
  dispose: () => void;
}

export function createBoard(store: GameStore): BoardView {
  const el = document.createElement('div');
  el.className = 'board';
  el.setAttribute('role', 'grid');
  el.setAttribute('aria-label', 'Crowns puzzle board');

  let cells: HTMLElement[] = [];
  let markEls: HTMLElement[] = [];
  let regionByCell: Uint8Array = new Uint8Array(0);
  let lastMarks = new Uint8Array(0);
  let builtId = -1;

  function build(p: ActivePuzzle): void {
    el.style.setProperty('--n', String(p.n));
    const frag = document.createDocumentFragment();
    cells = new Array(p.n * p.n);
    markEls = new Array(p.n * p.n);
    regionByCell = p.regionOf;
    lastMarks = new Uint8Array(p.n * p.n).fill(255); // force first paint

    for (let i = 0; i < p.n * p.n; i++) {
      const region = p.regionOf[i];
      const paletteIdx = p.regionColors[region];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.i = String(i);
      cell.dataset.region = String(region);
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = i === 0 ? 0 : -1; // roving tabindex for keyboard navigation
      cell.style.setProperty('--cell-bg', `var(--region-${paletteIdx}-fill)`);
      cell.style.setProperty('--cell-ink', `var(--region-${paletteIdx}-ink)`);

      const mark = document.createElement('div');
      mark.className = 'cell__mark';
      cell.appendChild(mark);

      frag.appendChild(cell);
      cells[i] = cell;
      markEls[i] = mark;
    }
    el.replaceChildren(frag);
  }

  const disposers: Array<() => void> = [];

  // (Re)build when the puzzle changes.
  disposers.push(
    effect(() => {
      const p = store.puzzle.get();
      if (!p || p.id === builtId) return;
      builtId = p.id;
      build(p);
    }),
  );

  // Patch marks (crown / X) for changed cells only.
  disposers.push(
    effect(() => {
      const m = store.marks.get();
      if (m.length !== cells.length) return;
      for (let i = 0; i < m.length; i++) {
        if (m[i] === lastMarks[i]) continue;
        lastMarks[i] = m[i];
        const markEl = markEls[i];
        const cell = cells[i];
        switch (m[i]) {
          case Mark.Crown:
            markEl.innerHTML = crownSvg;
            cell.dataset.mark = 'crown';
            break;
          case Mark.ManualX:
            markEl.innerHTML = xSvg;
            cell.dataset.mark = 'manual-x';
            break;
          case Mark.AutoX:
            markEl.innerHTML = xSvg;
            cell.dataset.mark = 'auto-x';
            break;
          default:
            markEl.innerHTML = '';
            cell.dataset.mark = 'empty';
        }
      }
    }),
  );

  // Conflict ring on crowns that break a rule.
  let lastConflicts = new Set<number>();
  disposers.push(
    effect(() => {
      const c = store.conflicts.get();
      for (const i of lastConflicts) if (!c.has(i)) cells[i]?.classList.remove('cell--conflict');
      for (const i of c) cells[i]?.classList.add('cell--conflict');
      lastConflicts = new Set(c);
    }),
  );

  // Gold outline around the hovered region's cells.
  let lastHoverRegion: number | null = null;
  disposers.push(
    effect(() => {
      const hr = store.hoverRegion.get();
      if (hr === lastHoverRegion) return;
      if (lastHoverRegion !== null) {
        for (let i = 0; i < cells.length; i++) {
          if (regionByCell[i] === lastHoverRegion) cells[i].classList.remove('cell--region-hover');
        }
      }
      if (hr !== null) {
        for (let i = 0; i < cells.length; i++) {
          if (regionByCell[i] === hr) cells[i].classList.add('cell--region-hover');
        }
      }
      lastHoverRegion = hr;
    }),
  );

  // Non-destructive hint highlight.
  let lastHintCells: number[] = [];
  disposers.push(
    effect(() => {
      const visible = store.hintVisible.get();
      const hint = store.hint.get();
      for (const i of lastHintCells) cells[i]?.classList.remove('cell--hint');
      lastHintCells = [];
      if (!visible || !hint) return;
      const targets: number[] = [];
      if (hint.kind === 'place-crown' || hint.kind === 'block-cell' || hint.kind === 'focus-region') {
        targets.push(hint.cell);
      } else if (hint.kind === 'region-line') {
        targets.push(...hint.cells);
      }
      for (const i of targets) {
        cells[i]?.classList.add('cell--hint');
        lastHintCells.push(i);
      }
    }),
  );

  return {
    el,
    dispose() {
      for (const d of disposers) d();
    },
  };
}
