import './styles/base.css';
import { applyTheme } from './theme/applyTheme';
import { activeTheme } from './theme/tokens';

/**
 * M0 bootstrap: apply the theme and render a placeholder board to verify the
 * style pipeline (cream page, thick border, thin grid, region palette). This is
 * replaced by the real worker-driven render in M2/M3.
 */
applyTheme(activeTheme);

const app = document.querySelector<HTMLDivElement>('#app')!;

function renderDemoBoard(n: number): void {
  const board = document.createElement('div');
  board.className = 'board';
  board.style.setProperty('--n', String(n));

  for (let i = 0; i < n * n; i++) {
    const col = i % n;
    const cell = document.createElement('div');
    cell.className = 'cell';
    // Demo coloring: each column shows a different palette entry.
    cell.style.setProperty('--cell-bg', `var(--region-${col % activeTheme.regions.length}-fill)`);
    cell.style.setProperty('--cell-ink', `var(--region-${col % activeTheme.regions.length}-ink)`);
    board.appendChild(cell);
  }

  app.replaceChildren(board);
}

renderDemoBoard(8);
