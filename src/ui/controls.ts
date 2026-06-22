/**
 * controls.ts — the small, deliberate controls arranged around the board, plus
 * the large central New Puzzle button. Every control reads/writes the store;
 * none holds its own state (except the local New-Puzzle confirm).
 */
import { effect, signal } from '../state/signal';
import type { GameStore } from '../state/store';
import { crownSvg, xSvg, undoSvg, hintSvg, featureSvg, blockHintSvg } from './icons';

export interface ControlsView {
  left: HTMLElement;
  right: HTMLElement;
  newPuzzle: HTMLElement;
  dispose: () => void;
}

function iconButton(ariaLabel: string, svg: string, shortLabel: string, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `ctl ${cls}`.trim();
  b.setAttribute('aria-label', ariaLabel);
  b.title = ariaLabel;
  b.innerHTML = `<span class="ctl__icon">${svg}</span><span class="ctl__label">${shortLabel}</span>`;
  return b;
}

export function createControls(store: GameStore): ControlsView {
  const disposers: Array<() => void> = [];
  const left = document.createElement('div');
  left.className = 'controls controls--left';
  const right = document.createElement('div');
  right.className = 'controls controls--right';

  // --- cursor mode switch (crown | block) ---
  const modeSwitch = document.createElement('div');
  modeSwitch.className = 'switch';
  modeSwitch.setAttribute('role', 'group');
  modeSwitch.setAttribute('aria-label', 'Cursor mode');
  const crownOpt = document.createElement('button');
  crownOpt.type = 'button';
  crownOpt.className = 'switch__opt';
  crownOpt.title = 'Crown mode — click places a crown';
  crownOpt.setAttribute('aria-label', 'Crown mode');
  crownOpt.innerHTML = `<span class="ctl__icon">${crownSvg}</span><span class="ctl__label">Crown</span>`;
  const blockOpt = document.createElement('button');
  blockOpt.type = 'button';
  blockOpt.className = 'switch__opt';
  blockOpt.title = 'Block mode — click places an X';
  blockOpt.setAttribute('aria-label', 'Block mode');
  blockOpt.innerHTML = `<span class="ctl__icon">${xSvg}</span><span class="ctl__label">Block</span>`;
  modeSwitch.append(crownOpt, blockOpt);
  crownOpt.addEventListener('click', () => {
    if (store.settings.peek().cursorMode !== 'crown') store.toggleCursorMode();
  });
  blockOpt.addEventListener('click', () => {
    if (store.settings.peek().cursorMode !== 'block') store.toggleCursorMode();
  });
  disposers.push(
    effect(() => {
      const mode = store.settings.get().cursorMode;
      crownOpt.classList.toggle('switch__opt--active', mode === 'crown');
      blockOpt.classList.toggle('switch__opt--active', mode === 'block');
      crownOpt.setAttribute('aria-pressed', String(mode === 'crown'));
      blockOpt.setAttribute('aria-pressed', String(mode === 'block'));
    }),
  );

  // --- auto-block toggle ---
  const autoToggle = document.createElement('button');
  autoToggle.type = 'button';
  autoToggle.className = 'toggle';
  autoToggle.innerHTML = `<span class="toggle__dot"></span><span class="toggle__label">Auto&#8209;block</span>`;
  autoToggle.addEventListener('click', () => store.toggleAutoBlock());
  disposers.push(
    effect(() => {
      const on = store.settings.get().autoBlock;
      autoToggle.classList.toggle('toggle--on', on);
      autoToggle.setAttribute('aria-pressed', String(on));
      autoToggle.title = on ? 'Auto-block is on' : 'Auto-block is off';
    }),
  );

  // --- easier-mode toggle (applies to newly generated puzzles) ---
  const easierToggle = document.createElement('button');
  easierToggle.type = 'button';
  easierToggle.className = 'toggle';
  easierToggle.innerHTML = `<span class="toggle__dot"></span><span class="toggle__label">Easier</span>`;
  easierToggle.addEventListener('click', () => store.toggleEasierMode());
  disposers.push(
    effect(() => {
      const on = store.settings.get().easierMode;
      easierToggle.classList.toggle('toggle--on', on);
      easierToggle.setAttribute('aria-pressed', String(on));
      easierToggle.title = on
        ? 'Easier mode is on — new puzzles guarantee line sections'
        : 'Easier mode is off — new puzzles are unconstrained';
    }),
  );

  // --- undo ---
  const undoBtn = iconButton('Undo (⌘Z)', undoSvg, 'Undo');
  undoBtn.addEventListener('click', () => store.undo());
  disposers.push(
    effect(() => {
      const can = store.canUndo.get();
      undoBtn.disabled = !can;
    }),
  );

  // --- random hint (places the next correct crown in the most-constrained region) ---
  const randomHintBtn = iconButton('Random Hint — reveal the next obvious crown', hintSvg, 'Random hint');
  randomHintBtn.addEventListener('click', () => store.showHint());

  // --- block hint (arm, then click a section to reveal that section's crown) ---
  const blockHintBtn = iconButton(
    'Block Hint — then click a section to reveal its crown',
    blockHintSvg,
    'Block hint',
    'ctl--feature',
  );
  blockHintBtn.addEventListener('click', () => store.toggleBlockHintArm());
  disposers.push(
    effect(() => {
      const armed = store.blockHintArmed.get();
      const glow = armed && store.hoverRegion.get() !== null;
      blockHintBtn.classList.toggle('ctl--armed', armed);
      blockHintBtn.classList.toggle('ctl--glow', glow);
      blockHintBtn.setAttribute('aria-pressed', String(armed));
    }),
  );

  // --- row/column feature ---
  const featureBtn = iconButton('Block the rest of a row/column for a line-confined region', featureSvg, 'Block line', 'ctl--feature');
  featureBtn.addEventListener('click', () => store.toggleRowColArm());
  disposers.push(
    effect(() => {
      const armed = store.rowColArmed.get();
      const glow = store.featurePlan.get() !== null;
      featureBtn.classList.toggle('ctl--armed', armed);
      featureBtn.classList.toggle('ctl--glow', glow);
      featureBtn.setAttribute('aria-pressed', String(armed));
    }),
  );

  left.append(modeSwitch, autoToggle, easierToggle);
  right.append(undoBtn, randomHintBtn, blockHintBtn, featureBtn);

  // --- new puzzle (large, central) with inline confirm ---
  const newPuzzle = document.createElement('div');
  newPuzzle.className = 'newpuzzle';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'newpuzzle__btn';
  newBtn.innerHTML = `<span class="newpuzzle__crown">${crownSvg}</span><span>New Puzzle</span>`;
  const confirmEl = document.createElement('div');
  confirmEl.className = 'newpuzzle__confirm';
  confirmEl.innerHTML = `
    <span class="newpuzzle__q">Start a new puzzle? Current progress will be lost.</span>
    <button type="button" class="newpuzzle__yes">New puzzle</button>
    <button type="button" class="newpuzzle__no">Keep playing</button>`;
  newPuzzle.append(newBtn, confirmEl);

  const confirming = signal(false);
  newBtn.addEventListener('click', () => {
    if (store.hasProgress() && store.status.peek() === 'playing') {
      confirming.set(true);
    } else {
      void store.startNewPuzzle();
    }
  });
  confirmEl.querySelector('.newpuzzle__yes')!.addEventListener('click', () => {
    confirming.set(false);
    void store.startNewPuzzle();
  });
  confirmEl.querySelector('.newpuzzle__no')!.addEventListener('click', () => confirming.set(false));
  disposers.push(
    effect(() => {
      newPuzzle.classList.toggle('newpuzzle--confirming', confirming.get());
    }),
  );
  // Reset the confirm whenever a new puzzle actually loads.
  disposers.push(
    effect(() => {
      store.puzzle.get();
      confirming.set(false);
    }),
  );

  return {
    left,
    right,
    newPuzzle,
    dispose() {
      for (const d of disposers) d();
    },
  };
}
