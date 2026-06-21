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
  let currentN = 0;

  function build(p: ActivePuzzle): void {
    currentN = p.n;
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

  // Regions highlight ONLY as part of the row/column feature: while it's armed
  // and the hovered region qualifies, outline the region's still-open (unblocked,
  // uncrowned) cells that lie on the line to be blocked — i.e. the candidate
  // cells in the block direction.
  let lastFeatureCells: number[] = [];
  disposers.push(
    effect(() => {
      const armed = store.rowColArmed.get();
      const plan = store.featurePlan.get();
      const m = store.marks.get();
      for (const i of lastFeatureCells) cells[i]?.classList.remove('cell--region-hover');
      lastFeatureCells = [];
      if (!armed || !plan || currentN === 0) return;
      for (let i = 0; i < cells.length; i++) {
        if (regionByCell[i] !== plan.region) continue;
        if (m[i] !== Mark.Empty) continue; // only unblocked, uncrowned tiles
        const onLine = plan.axis === 'row' ? ((i / currentN) | 0) === plan.line : i % currentN === plan.line;
        if (onLine) {
          cells[i].classList.add('cell--region-hover');
          lastFeatureCells.push(i);
        }
      }
    }),
  );

  // Brief flash on the crown the Hint button just placed.
  let lastFlash = -1;
  disposers.push(
    effect(() => {
      const fc = store.flashCell.get();
      if (lastFlash >= 0) cells[lastFlash]?.classList.remove('cell--hint');
      lastFlash = fc ?? -1;
      if (fc != null) cells[fc]?.classList.add('cell--hint');
    }),
  );

  return {
    el,
    dispose() {
      for (const d of disposers) d();
    },
  };
}
