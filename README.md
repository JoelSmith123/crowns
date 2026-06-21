# Crowns

A fast, fully client-side puzzle game based on LinkedIn **Queens**. Place a crown
in every row, column, and colored region so that no two crowns touch — not even
diagonally. Every puzzle is randomized and guaranteed to have a unique,
deduction-solvable answer.

Swiss-grid / Bauhaus look, no backend, no accounts, no tracking.

## Play

- **Crown / Block mode** — toggle the cursor switch. In crown mode a click places
  a crown; in block mode a click places an X. **Double-click always crowns.**
  Right-click toggles a block in either mode.
- **Auto-block** (on by default) — placing a crown auto-X's its row, column,
  region, and neighbors. Toggle it off in the controls.
- **Undo** — the undo button or `Cmd/Ctrl+Z`. Undoes a move and its auto-blocks
  as one step.
- **Hint** (`H`) — highlights the next logical deduction, preloaded for zero delay.
- **Row/Column feature** — when a region's open cells all lie on one line, its
  side button gently glows; click it, then click that region to block the rest of
  the line.
- **New Puzzle** — generates a fresh puzzle (random size 8–15); confirms first if
  one is in progress. The next puzzle is preloaded so it's instant.

Keyboard: `H` hint, `B` toggle cursor mode, `A` toggle auto-block, `Cmd/Ctrl+Z` undo.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run test       # Vitest (engine correctness + perf)
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

Stack: Vanilla TypeScript + Vite, zero runtime dependencies. All puzzle
generation, solving, and hint computation run in a Web Worker; the bundle is
~9 KB gzipped.

## Deploy (Cloudflare Pages)

The build is a static site in `dist/` with a relative base path, so it works at
any path. Two options:

- **Direct upload:** `npm run build && npx wrangler pages deploy dist`
- **Git integration:** connect the repo in the Cloudflare dashboard with build
  command `npm run build` and output directory `dist`.

## Architecture

- `src/core/` — pure, worker-safe, unit-tested engine (generator, propagation
  solver, carving to uniqueness, hint ladder, region coloring).
- `src/worker/` — the Web Worker and its typed message protocol; it owns the RNG
  and solutions (the answer is never sent to the main thread).
- `src/state/` — a tiny custom signal store; explicit crowns/blocks with derived
  auto-block/marks/conflicts overlays and transaction-based undo.
- `src/theme/` — every style value as one theme object flattened to CSS
  variables (future one-click theming).
- `src/ui/` — DOM board (CSS Grid) with minimal reactive patching, controls,
  input handling.
