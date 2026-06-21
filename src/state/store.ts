/**
 * store.ts — the single reactive state container and the dispatch choke point.
 *
 * Explicit player state (crowns, manualX) is the source of truth; everything the
 * renderer needs (marks, autoX overlay, conflicts, the feature plan) is derived.
 * Every board mutation goes through commit()/undo(), which wrap the change in a
 * batch (one render flush) and record/replay a Transaction (atomic undo).
 */
import { signal, computed, batch, type Signal, type Computed } from './signal';
import { History, type Transaction } from './history';
import { loadSettings, saveSettings, type Settings } from './persistence';
import type { WorkerClient, PuzzleData } from '../worker/client';
import type { Hint, RowColPlan } from '../core/types';
import { Mark } from '../core/types';
import { computeAutoX, computeConflicts, isSolved, rowColPlan } from '../core/autoblock';
import { assignRegionColors, hexToHue } from '../core/palette';
import { mulberry32 } from '../core/rng';
import { activeTheme } from '../theme/tokens';

export interface ActivePuzzle {
  id: number;
  n: number;
  regionOf: Uint8Array;
  /** region id -> palette index */
  regionColors: number[];
}

export type Status = 'loading' | 'playing' | 'won';

const EMPTY: ReadonlySet<number> = new Set<number>();
const HUES = activeTheme.regions.map((r) => hexToHue(r.fill));
const PALETTE_SIZE = activeTheme.regions.length;
const HINT_DEBOUNCE_MS = 50;

export interface GameStore {
  // --- core signals ---
  puzzle: Signal<ActivePuzzle | null>;
  status: Signal<Status>;
  crowns: Signal<ReadonlySet<number>>;
  manualX: Signal<ReadonlySet<number>>;
  settings: Signal<Settings>;
  hoverRegion: Signal<number | null>;
  rowColArmed: Signal<boolean>;
  hint: Signal<Hint | null>;
  hintVisible: Signal<boolean>;
  canUndo: Signal<boolean>;
  nextReady: Signal<boolean>;

  // --- derived ---
  autoX: Computed<ReadonlySet<number>>;
  blocked: Computed<ReadonlySet<number>>;
  marks: Computed<Uint8Array>;
  conflicts: Computed<ReadonlySet<number>>;
  featurePlan: Computed<RowColPlan | null>;

  // --- actions ---
  init(): Promise<void>;
  clickCell(cell: number): void;
  doubleClickCell(cell: number): void;
  /** Toggle a manual block regardless of cursor mode (used by right-click). */
  blockAt(cell: number): void;
  toggleCursorMode(): void;
  setAutoBlock(on: boolean): void;
  toggleAutoBlock(): void;
  undo(): void;
  setHover(region: number | null): void;
  toggleRowColArm(): void;
  showHint(): void;
  hasProgress(): boolean;
  startNewPuzzle(): Promise<void>;
}

export function createStore(worker: WorkerClient): GameStore {
  const puzzle = signal<ActivePuzzle | null>(null);
  const status = signal<Status>('loading');
  const crowns = signal<ReadonlySet<number>>(EMPTY);
  const manualX = signal<ReadonlySet<number>>(EMPTY);
  const settings = signal<Settings>(loadSettings());
  const hoverRegion = signal<number | null>(null);
  const rowColArmed = signal(false);
  const hint = signal<Hint | null>(null);
  const hintVisible = signal(false);
  const canUndo = signal(false);
  const nextReady = signal(false);

  const history = new History();
  let nextPuzzle: PuzzleData | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;

  // --- derived state ---
  const autoX = computed<ReadonlySet<number>>(() => {
    const p = puzzle.get();
    if (!p || !settings.get().autoBlock) return EMPTY;
    return computeAutoX(p.n, p.regionOf, crowns.get());
  });

  const blocked = computed<ReadonlySet<number>>(() => {
    const ax = autoX.get();
    const mx = manualX.get();
    if (mx.size === 0) return ax;
    const s = new Set(ax);
    for (const c of mx) s.add(c);
    return s;
  });

  const marks = computed<Uint8Array>(() => {
    const p = puzzle.get();
    if (!p) return new Uint8Array(0);
    const m = new Uint8Array(p.n * p.n);
    for (const c of crowns.get()) m[c] = Mark.Crown;
    for (const c of manualX.get()) if (m[c] === Mark.Empty) m[c] = Mark.ManualX;
    for (const c of autoX.get()) if (m[c] === Mark.Empty) m[c] = Mark.AutoX;
    return m;
  });

  const conflicts = computed<ReadonlySet<number>>(() => {
    const p = puzzle.get();
    if (!p) return EMPTY;
    return computeConflicts(p.n, p.regionOf, crowns.get());
  });

  const featurePlan = computed<RowColPlan | null>(() => {
    const p = puzzle.get();
    const hr = hoverRegion.get();
    if (!p || hr === null || status.get() !== 'playing') return null;
    return rowColPlan(p.n, p.regionOf, hr, crowns.get(), blocked.get());
  });

  // --- internals ---
  function scheduleHint(): void {
    if (hintTimer) clearTimeout(hintTimer);
    const p = puzzle.peek();
    if (!p) return;
    hintTimer = setTimeout(() => requestHintNow(), HINT_DEBOUNCE_MS);
  }

  function requestHintNow(): void {
    const p = puzzle.peek();
    if (!p) return;
    worker.computeHint(p.id, [...crowns.peek()], [...manualX.peek()], settings.peek().autoBlock);
  }

  /** Recompute status + invalidate the shown hint after any board change. */
  function postChange(): void {
    const p = puzzle.peek();
    if (p) status.set(isSolved(p.n, p.regionOf, crowns.peek()) ? 'won' : 'playing');
    hintVisible.set(false);
    hint.set(null);
    scheduleHint();
  }

  function applyDiff(tx: Transaction): void {
    if (tx.crownsAdd.length || tx.crownsDel.length) {
      const s = new Set(crowns.peek());
      for (const c of tx.crownsDel) s.delete(c);
      for (const c of tx.crownsAdd) s.add(c);
      crowns.set(s);
    }
    if (tx.manualXAdd.length || tx.manualXDel.length) {
      const s = new Set(manualX.peek());
      for (const c of tx.manualXDel) s.delete(c);
      for (const c of tx.manualXAdd) s.add(c);
      manualX.set(s);
    }
  }

  function commit(tx: Transaction): void {
    batch(() => {
      applyDiff(tx);
      history.push(tx);
      canUndo.set(history.size > 0);
      postChange();
    });
  }

  function persistSettings(next: Settings): void {
    settings.set(next);
    saveSettings(next);
  }

  function adopt(data: PuzzleData): void {
    const regionOf = Uint8Array.from(data.regionOf);
    const rng = mulberry32((data.id * 2654435761) >>> 0);
    const regionColors = assignRegionColors(data.n, regionOf, PALETTE_SIZE, rng, HUES);
    batch(() => {
      puzzle.set({ id: data.id, n: data.n, regionOf, regionColors });
      crowns.set(EMPTY);
      manualX.set(EMPTY);
      history.clear();
      canUndo.set(false);
      hint.set(null);
      hintVisible.set(false);
      rowColArmed.set(false);
      hoverRegion.set(null);
      status.set('playing');
    });
    scheduleHint();
  }

  function prefetchNext(): void {
    nextReady.set(false);
    worker.generate().then((d) => {
      nextPuzzle = d;
      nextReady.set(true);
    });
  }

  // --- click semantics ---
  function crownToggle(cell: number): void {
    if (crowns.peek().has(cell)) {
      commit({ crownsAdd: [], crownsDel: [cell], manualXAdd: [], manualXDel: [], label: 'uncrown' });
    } else {
      const del = manualX.peek().has(cell) ? [cell] : [];
      commit({ crownsAdd: [cell], crownsDel: [], manualXAdd: [], manualXDel: del, label: 'crown' });
    }
  }

  function blockToggle(cell: number): void {
    if (manualX.peek().has(cell)) {
      commit({ crownsAdd: [], crownsDel: [], manualXAdd: [], manualXDel: [cell], label: 'unblock' });
    } else if (crowns.peek().has(cell)) {
      commit({ crownsAdd: [], crownsDel: [cell], manualXAdd: [cell], manualXDel: [], label: 'block' });
    } else {
      commit({ crownsAdd: [], crownsDel: [], manualXAdd: [cell], manualXDel: [], label: 'block' });
    }
  }

  function executeFeature(cell: number): void {
    const p = puzzle.peek();
    rowColArmed.set(false);
    if (!p) return;
    const region = p.regionOf[cell];
    const plan = rowColPlan(p.n, p.regionOf, region, crowns.peek(), blocked.peek());
    if (plan && plan.targets.length) {
      commit({ crownsAdd: [], crownsDel: [], manualXAdd: plan.targets, manualXDel: [], label: 'feature' });
    }
  }

  return {
    puzzle,
    status,
    crowns,
    manualX,
    settings,
    hoverRegion,
    rowColArmed,
    hint,
    hintVisible,
    canUndo,
    nextReady,
    autoX,
    blocked,
    marks,
    conflicts,
    featurePlan,

    async init() {
      worker.onHint((puzzleId, h) => {
        const p = puzzle.peek();
        if (!p || p.id !== puzzleId) return; // stale reply
        hint.set(h);
      });
      await this.startNewPuzzle();
    },

    clickCell(cell) {
      if (rowColArmed.peek()) {
        executeFeature(cell);
        return;
      }
      if (settings.peek().cursorMode === 'crown') crownToggle(cell);
      else blockToggle(cell);
    },

    doubleClickCell(cell) {
      if (rowColArmed.peek()) {
        executeFeature(cell);
        return;
      }
      if (crowns.peek().has(cell)) return; // already a crown
      const del = manualX.peek().has(cell) ? [cell] : [];
      commit({ crownsAdd: [cell], crownsDel: [], manualXAdd: [], manualXDel: del, label: 'crown' });
    },

    blockAt(cell) {
      blockToggle(cell);
    },

    toggleCursorMode() {
      const s = settings.peek();
      persistSettings({ ...s, cursorMode: s.cursorMode === 'crown' ? 'block' : 'crown' });
    },

    setAutoBlock(on) {
      const s = settings.peek();
      if (s.autoBlock === on) return;
      persistSettings({ ...s, autoBlock: on });
      hintVisible.set(false);
      scheduleHint();
    },

    toggleAutoBlock() {
      this.setAutoBlock(!settings.peek().autoBlock);
    },

    undo() {
      const tx = history.pop();
      if (!tx) return;
      batch(() => {
        applyDiff({
          crownsAdd: tx.crownsDel,
          crownsDel: tx.crownsAdd,
          manualXAdd: tx.manualXDel,
          manualXDel: tx.manualXAdd,
          label: 'undo',
        });
        canUndo.set(history.size > 0);
        postChange();
      });
    },

    setHover(region) {
      hoverRegion.set(region);
    },

    toggleRowColArm() {
      rowColArmed.set(!rowColArmed.peek());
    },

    showHint() {
      hintVisible.set(true);
      if (!hint.peek()) requestHintNow();
    },

    hasProgress() {
      return crowns.peek().size > 0 || manualX.peek().size > 0;
    },

    async startNewPuzzle() {
      status.set('loading');
      let data = nextPuzzle;
      nextPuzzle = null;
      if (!data) data = await worker.generate();
      adopt(data);
      prefetchNext();
    },
  };
}
