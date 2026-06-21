/**
 * applyTheme.ts — flattens a Theme into CSS custom properties on :root.
 *
 * Every visual value in the app is read through one of these `--vars`, so this
 * function is the only place the theme object touches the DOM. Call it once at
 * boot; calling it again with a different Theme would re-skin the entire app.
 */
import type { Theme } from './tokens';

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  const s = root.style;

  s.setProperty('--page-bg', theme.page.bg);
  s.setProperty('--page-text', theme.page.text);
  s.setProperty('--page-muted', theme.page.muted);

  s.setProperty('--board-border', theme.board.border);
  s.setProperty('--board-border-width', theme.board.borderWidth);
  s.setProperty('--board-grid', theme.board.grid);
  s.setProperty('--board-grid-width', theme.board.gridWidth);
  s.setProperty('--board-radius', theme.board.radius);

  s.setProperty('--accent', theme.accent);
  s.setProperty('--ink-light', theme.ink.light);
  s.setProperty('--ink-dark', theme.ink.dark);
  s.setProperty('--x-opacity', String(theme.xOpacity));
  s.setProperty('--conflict', theme.conflict);

  s.setProperty('--control-bg', theme.control.bg);
  s.setProperty('--control-bg-hover', theme.control.bgHover);
  s.setProperty('--control-border', theme.control.border);
  s.setProperty('--control-text', theme.control.text);
  s.setProperty('--control-active-bg', theme.control.activeBg);
  s.setProperty('--control-active-text', theme.control.activeText);
  s.setProperty('--control-radius', theme.control.radius);
  s.setProperty('--control-size', theme.control.size);
  s.setProperty('--control-gap', theme.control.gap);

  s.setProperty('--font-ui', theme.font.ui);

  // Per-region fill + resolved ink color. The renderer points a cell at its
  // region via `--cell-bg: var(--region-<k>-fill)`.
  theme.regions.forEach((region, i) => {
    s.setProperty(`--region-${i}-fill`, region.fill);
    s.setProperty(`--region-${i}-ink`, region.ink === 'light' ? theme.ink.light : theme.ink.dark);
  });
}
