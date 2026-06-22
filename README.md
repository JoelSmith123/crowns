# Crowns

A fast, fully client-side puzzle game based on LinkedIn **Queens**. Place a crown
in every row, column, and colored region so that no two crowns touch — not even
diagonally. Every puzzle is randomized and guaranteed to have a unique,
deduction-solvable answer.

Swiss-grid / Bauhaus look, no backend, no accounts, no tracking.
Live: https://crowns-1dw.pages.dev

## Play

- **Cursor mode (Crown / Block switch).** A single click does the current mode's
  action; a **double-click does the other one**:
  - **Block mode** (the default): single-click places an X, double-click crowns.
  - **Crown mode**: single-click crowns, double-click places an X.
  - Right-click always toggles a block.
- **Auto-block** (on by default) — placing a crown auto-X's its whole row,
  column, region, and 8 neighbors. Toggle it off in the controls.
- **Easier mode** (on by default) — newly generated puzzles guarantee some
  single-row / single-column sections (more on bigger boards: 2 up to 9×9, 3 for
  10–12, 4 for 13×13+), which makes them easier to crack. Toggle it off for
  unconstrained puzzles; the change applies to the next New Puzzle.
- **Undo** — the undo button or `Cmd/Ctrl+Z`. Reverts a move *and* its auto-blocks
  as one step.
- **Random Hint** — places the next correct crown (with auto-block) and briefly
  flashes it. Press repeatedly to walk through a solve. Preloaded, so it's instant.
- **Block Hint** — reveal the crown of a *section you choose*: click it to arm,
  then click any tile of a colored section and that section's crown appears (with
  auto-block). The hovered section is outlined while armed.
- **Block line** (the row/column feature) — when a region's still-open cells all
  lie on one row or column, this side button gently glows. Click it to arm, then
  click a tile of that region to block the rest of that line. While armed, the
  region's open cells on the line are outlined to show what's about to happen.
- **New Puzzle** — generates a fresh puzzle (random size 8–15); confirms first if
  one is in progress. The next puzzle is preloaded, so it's instant.

Keyboard: arrow keys move focus on the board; `Space`/`Enter` does the cursor
mode's action on the focused cell; `X` blocks it, `C` crowns it; `H` random hint,
`B` switch cursor mode, `A` toggle auto-block, `Cmd/Ctrl+Z` undo.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run test       # Vitest (engine correctness + generation perf)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build (static, like Cloudflare)
```

Stack: Vanilla TypeScript + Vite, zero runtime dependencies. All puzzle
generation, solving, and hint computation run in a Web Worker; the bundle is
tiny (~11 KB gzipped).

To screenshot/verify the running app, use the Claude Preview MCP — `.claude/launch.json`
defines `crowns-dev` (dev server) and `crowns-preview` (production build).

## Deploy (Cloudflare Pages)

`main` is the production branch: Cloudflare Pages is connected to this repo and
**auto-deploys every push to `main`** (build `npm run build`, output `dist/`). So
the deploy flow is: branch → PR → merge to `main` → it goes live in ~1 minute.

The build is a static site with a relative base path, so it also works via direct
upload: `npm run build && npx wrangler pages deploy dist`.

## Architecture

Three layers, strictly separated (see [docs/architecture.md](docs/architecture.md)
for the deep dive — module responsibilities, generation pipeline, data flow):

- `src/core/` — pure, worker-safe, unit-tested engine: puzzle generation,
  constraint-propagation solver, carving to a unique deduction-solvable puzzle,
  hint selection, region coloring. Imports nothing from the other layers.
- `src/worker/` — the Web Worker and its typed message protocol. It owns the RNG
  and the solutions; the answer is never sent to the main thread.
- `src/state/` — a tiny custom signal store. Explicit state is just crowns +
  manual X's; auto-block, render marks, conflicts, and the feature plan are all
  *derived*. Every board mutation goes through `commit()`/`undo()`.
- `src/theme/` — every style value lives in one theme object, flattened to CSS
  variables (so a future one-click theme swap is trivial).
- `src/ui/` — DOM board (CSS Grid) with minimal reactive patching, the controls,
  and input handling.
