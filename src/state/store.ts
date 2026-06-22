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
  /** Block Hint armed: next click reveals the chosen region's crown. */
  blockHintArmed: Signal<boolean>;
  hint: Signal<Hint | null>;
  /** Cell to briefly highlight after the Hint button places a crown there. */
  flashCell: Signal<number | null>;
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
  /** Place a crown regardless of cursor mode (used by the keyboard 'c'). */
  crownAt(cell: number): void;
  toggleCursorMode(): void;
  setAutoBlock(on: boolean): void;
  toggleAutoBlock(): void;
  setEasierMode(on: boolean): void;
  toggleEasierMode(): void;
  undo(): void;
  setHover(region: number | null): void;
  toggleRowColArm(): void;
  toggleBlockHintArm(): void;
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
  const blockHintArmed = signal(false);
  const hint = signal<Hint | null>(null);
  const flashCell = signal<number | null>(null);
  const canUndo = signal(false);
  const nextReady = signal(false);

  const history = new History();
  let nextPuzzle: PuzzleData | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let placeHintWhenReady = false;
  let prefetchToken = 0; // guards against a stale (old-mode) prefetch overwriting a newer one

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

  /** Recompute status + invalidate the preloaded hint after any board change. */
  function postChange(): void {
    const p = puzzle.peek();
    if (p) status.set(isSolved(p.n, p.regionOf, crowns.peek()) ? 'won' : 'playing');
    flashCell.set(null);
    hint.set(null);
    scheduleHint();
  }

  /** Place the hinted crown and briefly flash it so the player sees it appear. */
  function placeHintCrown(cell: number): void {
    ensureCrown(cell); // commit crown + auto-block (postChange clears the flash)
    flashCell.set(cell);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashCell.set(null), 900);
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
      flashCell.set(null);
      placeHintWhenReady = false;
      rowColArmed.set(false);
      blockHintArmed.set(false);
      hoverRegion.set(null);
      status.set('playing');
    });
    scheduleHint();
  }

  function prefetchNext(): void {
    nextReady.set(false);
    const token = ++prefetchToken;
    worker.generate(settings.peek().easierMode).then((d) => {
      if (token !== prefetchToken) return; // a newer prefetch (e.g. after an easier-mode toggle) superseded this
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

  // Double-click / explicit-key actions: set the mark (idempotent), not toggle.
  function ensureCrown(cell: number): void {
    if (crowns.peek().has(cell)) return;
    const del = manualX.peek().has(cell) ? [cell] : [];
    commit({ crownsAdd: [cell], crownsDel: [], manualXAdd: [], manualXDel: del, label: 'crown' });
  }

  function ensureBlock(cell: number): void {
    if (manualX.peek().has(cell)) return;
    const del = crowns.peek().has(cell) ? [cell] : [];
    commit({ crownsAdd: [], crownsDel: del, manualXAdd: [cell], manualXDel: [], label: 'block' });
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

  /**
   * Block Hint: reveal the chosen region's crown. The solution lives only in the
   * worker, so ask it for this region's crown, then place it (auto-block + flash
   * via the normal hint path). Guards against the puzzle changing mid-await.
   */
  async function executeBlockHint(cell: number): Promise<void> {
    const p = puzzle.peek();
    blockHintArmed.set(false);
    if (!p) return;
    const pid = p.id;
    const sol = await worker.revealRegion(pid, p.regionOf[cell]);
    if (sol == null || puzzle.peek()?.id !== pid) return; // unknown region, or puzzle moved on
    placeHintCrown(sol);
  }

  return {
    puzzle,
    status,
    crowns,
    manualX,
    settings,
    hoverRegion,
    rowColArmed,
    blockHintArmed,
    hint,
    flashCell,
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
        if (placeHintWhenReady && h && h.kind === 'place-crown') {
          placeHintWhenReady = false;
          placeHintCrown(h.cell);
        }
      });
      await this.startNewPuzzle();
    },

    clickCell(cell) {
      if (blockHintArmed.peek()) {
        void executeBlockHint(cell);
        return;
      }
      if (rowColArmed.peek()) {
        executeFeature(cell);
        return;
      }
      if (settings.peek().cursorMode === 'crown') crownToggle(cell);
      else blockToggle(cell);
    },

    doubleClickCell(cell) {
      if (blockHintArmed.peek()) {
        void executeBlockHint(cell);
        return;
      }
      if (rowColArmed.peek()) {
        executeFeature(cell);
        return;
      }
      // Double-click does the OPPOSITE of the current cursor mode's single click:
      // block mode → crown, crown mode → block.
      if (settings.peek().cursorMode === 'block') ensureCrown(cell);
      else ensureBlock(cell);
    },

    blockAt(cell) {
      blockToggle(cell);
    },

    crownAt(cell) {
      ensureCrown(cell);
    },

    toggleCursorMode() {
      const s = settings.peek();
      persistSettings({ ...s, cursorMode: s.cursorMode === 'crown' ? 'block' : 'crown' });
    },

    setAutoBlock(on) {
      const s = settings.peek();
      if (s.autoBlock === on) return;
      persistSettings({ ...s, autoBlock: on });
      scheduleHint();
    },

    toggleAutoBlock() {
      this.setAutoBlock(!settings.peek().autoBlock);
    },

    setEasierMode(on) {
      const s = settings.peek();
      if (s.easierMode === on) return;
      persistSettings({ ...s, easierMode: on });
      // Apply to the NEXT generated puzzle: drop the old-mode prefetch and refetch
      // (the current board is left untouched). The token guard ignores the stale one.
      nextPuzzle = null;
      prefetchNext();
    },

    toggleEasierMode() {
      this.setEasierMode(!settings.peek().easierMode);
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
      blockHintArmed.set(false); // the two armed modes are mutually exclusive
      rowColArmed.set(!rowColArmed.peek());
    },

    toggleBlockHintArm() {
      rowColArmed.set(false); // the two armed modes are mutually exclusive
      blockHintArmed.set(!blockHintArmed.peek());
    },

    showHint() {
      const h = hint.peek();
      if (h && h.kind === 'place-crown') {
        placeHintCrown(h.cell);
      } else {
        // Hint not computed yet — request it and place as soon as it arrives.
        placeHintWhenReady = true;
        requestHintNow();
      }
    },

    hasProgress() {
      return crowns.peek().size > 0 || manualX.peek().size > 0;
    },

    async startNewPuzzle() {
      status.set('loading');
      let data = nextPuzzle;
      nextPuzzle = null;
      if (!data) data = await worker.generate(settings.peek().easierMode);
      adopt(data);
      prefetchNext();
    },
  };
}
