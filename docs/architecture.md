# Crowns — Architecture

A reference for understanding and changing the codebase. For play/dev/deploy
basics see [../README.md](../README.md); for the short agent-facing rules and
gotchas see [../CLAUDE.md](../CLAUDE.md).

## Rules of the game

An `n×n` grid (`n` random in 8–15) is partitioned into `n` contiguous colored
regions. Place `n` crowns so that each **row**, each **column**, and each
**region** has exactly one crown, and **no two crowns are king's-move adjacent**
(the 8 surrounding cells). Crowns may share a row-line / column-line / diagonal
at distance ≥ 2 — only direct adjacency is forbidden. Every generated puzzle has
a **unique** solution, and one solvable by pure deduction (no guessing).

## Layering (enforced)

```
core/  ──>  (nothing in this repo; pure + worker-safe)
worker/ ──> core/ + worker/protocol.ts
state/ ──> core/, theme/, worker/ (types only via protocol/client)
ui/    ──> state/, theme/, core/ (types), ui/
theme/ ──> (nothing)
```

`core/` must stay pure (no DOM, no `window`) so it runs in the worker and is
trivially unit-testable. Cells are addressed by a single index `i = row*n + col`
everywhere on the hot path; convert to `{row, col}` only at boundaries
(`core/grid.ts`).

## Data flow at a glance

```
worker (RNG + solution, private)
     │ GENERATE → { id, n, regionOf }            COMPUTE_HINT → { hint }
     ▼
state/store.ts  (signals)
   explicit:  crowns, manualX, settings
   derived:   autoX → blocked → marks            (computed from crowns + settings)
              conflicts, featurePlan
     │ effects
     ▼
ui/board.ts   patches only changed cells (diff vs cached marks) + class toggles
```

The store is the single source of truth on the main thread. Explicit player
state is just `crowns` + `manualX`; **everything else is derived**, which is what
makes undo and the auto-block toggle fall out for free (see "Derived overlay").

## core/ — the engine

- **`types.ts`** — `Mark` (Empty/Crown/AutoX/ManualX), `Hint`, `RowColPlan`,
  `GeneratedPuzzle` (includes the solution; worker-only), `PuzzleView`.
- **`rng.ts`** — seedable `mulberry32` PRNG + `shuffle`/`randInt`/`range`.
  Seedable so generation is deterministic in tests; the worker seeds from
  `Date.now()`/`Math.random()` at runtime.
- **`grid.ts`** — index↔`{r,c}`, `neighbors4`/`neighbors8`, `isAdjacent8`.
- **`solver.ts`** — the solver. `runSearch(n, regionOf, limit, budget)` is a
  constraint-propagation search: rows, columns and regions are all "units" that
  need one crown; it places **naked singles** (a unit with one candidate) to a
  fixpoint, then branches on the most-constrained unit. State is a single set of
  arrays mutated in place with a **journaled undo** (no per-branch allocation),
  and a **node budget** aborts hopeless searches. `countSolutions`,
  `firstSolution`, `enumerate` wrap it; `countSolutionsBrute` is an independent
  reference solver used only to cross-check in tests.
- **`generator.ts`** — `randomSolution` (a column permutation with
  `|p[r]-p[r+1]| ≥ 2`, the complete adjacency condition), `growRegions`
  (weighted multi-source BFS from the crown seeds), and `carveToUnique`. Both
  growth and carve take an optional easier-mode `plan` (see `easier.ts`).
- **`easier.ts`** — easier-mode policy: `planEasier` picks the guaranteed
  one-line regions and their pre-claim cells; `lineRegionThreshold` (2/3/4 by
  size) and `countOneLineRegions` (the gate).
- **`uniqueness.ts`** — `generateUniquePuzzle` ties it together (`opts.easier`
  re-plans per attempt).
- **`palette.ts`** — `assignRegionColors` gives every region a **distinct**
  palette color (graph-colored by descending adjacency degree, choosing the
  most hue-distant available color), plus `hexToHue`/`buildRegionAdjacency`.
- **`autoblock.ts`** — `computeAutoX` (the derived block overlay),
  `computeConflicts`, `isSolved`, and `rowColPlan` (the feature predicate).
- **`hint.ts`** — `computeHint` returns the next crown to place;
  `solutionCrownForRegion` answers Block Hint (a chosen region's solution crown).

### Generation pipeline (the hard part)

Random regions are **essentially never uniquely solvable** (measured ~0% at every
size; a fresh map has 15,000+ solutions). So generation is:

1. `randomSolution` — pick a valid crown placement first (guarantees solvability).
2. `growRegions` — grow `n` contiguous blob regions from the crown seeds.
3. `carveToUnique` — repeatedly find alternate solutions and **carve** them away:
   move one crown cell of an alternate into an adjacent region, which invalidates
   that alternate while keeping the intended solution valid and regions
   contiguous. Two refinements make this fast and produce *nice* puzzles:
   - a **node budget** on the solver rejects puzzles whose uniqueness would need
     deep guessing (keeps only deduction-friendly ones), and
   - on a stall or budget abort the carve **perturbs** (moves a few random
     non-solution boundary cells) instead of throwing away progress and
     regrowing. This cut grow+carve attempts from ~40/puzzle to single digits.
     **Never perturb a solution-crown cell** or the intended solution breaks.
4. `assignRegionColors` — distinct colors, computed on the main thread (so `core/`
   stays theme-free); the store seeds it deterministically from the puzzle id.

Two reasons this is delicate: (a) random regions are ~0% unique, so you can't
just "generate and check"; (b) the dev machine's timing is unreliable (see
Gotchas), so tune against **attempt counts**, not wall-clock.

**Easier mode** (opt-in, default on). The one-line region COUNT is guaranteed by
construction (never rejection sampling). `planEasier` picks `threshold(n)` regions
(2/3/4 by size) to confine to a single row/column, each with a varied target
length. `growRegions(plan)` grows them axis-restricted and FIRST (so blobs can't
truncate them), with a pre-claim keeping every region ≥ 2 and a **blob-only**
cleanup that leaves a rare strip-ringed pocket UNASSIGNED (→ regrow in
`uniqueness.ts`, never a broken line). `carveToUnique(plan)` never moves a cell
INTO a line-region, and **prefers** trimming blob crowns over line crowns: fully
protecting line cells starves carve (crown-swap cycles among long strips spike
attempts), while no preference trims them to dominoes — the preference keeps them
longish (avg ≈ 3, varied 2–6). Final length is a quality/perf trade (carve trims
some back for uniqueness, costing a few extra attempts); the `countOneLineRegions`
gate is belt-and-suspenders.

## worker/ — the boundary

- **`protocol.ts`** — the shared, typed message contract. Requests: `GENERATE`
  (carries the `easier` flag), `COMPUTE_HINT`, `REVEAL_REGION` (Block Hint).
  Responses: `GENERATED` (sends `{id, n, regionOf}` — **never the solution**),
  `HINT`, `REGION_CROWN` (one region's solution crown), `ERROR`. Every message
  carries a `reqId`; puzzle-scoped ones carry `puzzleId` so the main thread can
  drop stale replies.
- **`puzzle.worker.ts`** — owns the RNG and a small map of `{n, regionOf,
  solution}` by puzzle id, so it can answer hints (and Block Hint region reveals)
  without the solution ever crossing to the main thread. `self` is typed via a
  minimal cast to avoid the DOM-vs-WebWorker lib clash.
- **`client.ts`** — main-thread wrapper: `generate(easier)` and `revealRegion()`
  are promise-based; hints are a push channel (`onHint`).

## state/ — the reactive store

- **`signal.ts`** — a small (~130-line) fine-grained reactivity system. `signal`, `effect`,
  `batch`, and a deliberately **transparent `computed`**: `computed(fn).get()`
  just runs `fn()` in the caller's tracking context, so whoever reads a computed
  subscribes to the signals it reads (no separate node ⇒ no glitches). Recompute
  cost is trivial at ≤225 cells.
- **`store.ts`** — `createStore(worker)`. Signals: `puzzle`, `status`, `crowns`,
  `manualX`, `settings`, `hoverRegion`, `rowColArmed`, `blockHintArmed`, `hint`,
  `flashCell`, `canUndo`, `nextReady`. Derived computeds: `autoX`, `blocked`,
  `marks` (the only thing the renderer reads), `conflicts`, `featurePlan`.
- **`history.ts`** — the undo stack of `Transaction`s.
- **`persistence.ts`** — `localStorage` for **settings only** (cursor mode
  defaults to **block**, auto-block on, easier mode on). Wrapped in try/catch.

### Derived overlay (why undo is trivial)

Auto-block X's are **not stored**. `marks` and `autoX` are pure functions of the
crown set, recomputed on change. So undo only records diffs to `crowns`/`manualX`
(`commit()` pushes one `Transaction` per gesture; `undo()` applies the inverse),
and toggling auto-block is just a recompute — no orphaned marks, no bookkeeping.

### Click semantics (store-side)

- `clickCell` — the cursor mode's single action (block in block mode, crown in
  crown mode), unless an armed mode intercepts it (Block line → `executeFeature`,
  Block Hint → `executeBlockHint`).
- `doubleClickCell` — the **opposite** of the cursor mode (block→crown,
  crown→block), via idempotent `ensureCrown`/`ensureBlock`.
- `crownAt` / `blockAt` — explicit place-crown / toggle-block (keyboard, right-click).
- `executeFeature` — applies `rowColPlan(...).targets` as one transaction, disarms.
- `executeBlockHint` — Block Hint: `await worker.revealRegion(...)` for the clicked
  section, then places that crown (auto-block + flash) and disarms; guards a puzzle
  change mid-await. The two armed modes are mutually exclusive.
- `showHint` (Random Hint) — **places** the hinted crown (`computeHint` →
  most-constrained crownless region's solution crown), auto-blocks via the normal
  commit, and sets `flashCell` for a ~900 ms gold flash. If the hint isn't
  preloaded yet, it requests one and places it on arrival.

## ui/ — rendering & input

- **`board.ts`** — builds the `n×n` grid once per puzzle (CSS Grid, `data-i`,
  region color via `--cell-bg`). Reactive **effects patch only what changed**:
  the marks effect diffs `marks` against a cached copy and updates just the
  changed cells; separate effects toggle `cell--conflict`, the feature highlight,
  and the hint flash. No virtual DOM, no `innerHTML` rebuilds.
  - **Feature highlight**: while Block line is armed and the hovered region
    qualifies, it outlines only that region's **still-open (unblocked) cells on
    the line** that will be blocked — the candidates in the block direction. A
    parallel effect outlines the **whole** hovered region while Block Hint is
    armed (the section whose crown a click will reveal).
- **`input.ts`** — pointer/keyboard via delegation. **Single vs double click uses
  the browser's native click count (`event.detail`)**, not a timer: the first
  click acts immediately (so blocking feels instant), and a real double-click
  (`detail === 2`, OS threshold) undoes that single action and performs the
  double action instead. (The old 200 ms timer both lagged every single click and
  silently dropped slow double-clicks — don't reintroduce it.) Also: right-click
  blocks; arrow keys move a roving focus; `Space/Enter`/`X`/`C` act on the focused
  cell.
- **`controls.ts`** — the ring of small labeled controls: the Crown/Block switch,
  Auto-block + Easier toggles, Undo, Random Hint, the **Block Hint** and **Block
  line** armed-feature buttons (gold glow when a hovered region qualifies; armed
  state). Plus the large central New Puzzle button with an inline confirm.
- **`view.ts`** — layout (board centered, controls flanking, stacked ≤960px) and
  global keyboard shortcuts.
- **`icons.ts`**, **`winOverlay.ts`** — inline SVGs; the "Solved" badge + board glow.

## theme/

`tokens.ts` is the **only** place with color/style literals; `applyTheme.ts`
flattens the active theme to `--kebab` CSS variables on `:root`. `base.css` and
components read `var(--…)` only. A future one-click theme = swap the object and
re-apply. The palette has ≥16 distinct warm-Bauhaus colors (board size maxes at
15 regions). Each color carries a contrast-aware `ink` (light/dark) for the
crown/X glyph.

## Testing

`npm run test` (Vitest over pure `core/`, see `src/core/*.test.ts`): solution
validity & the adjacency-rule equivalence, region invariants (partition,
contiguity, one-seed), **uniqueness** (cross-checked against the brute solver),
RNG determinism, solver propagation vs brute, the hint engine (always a valid
solution crown), auto-block/conflict/feature predicates, distinct region colors,
palette contrast, the **easier-mode** one-line guarantee + determinism (uniqueness
still cross-checked vs brute), and a generation perf guard (easier attempt counts
stay at parity with normal). UI/store are verified in-browser via the Claude
Preview MCP rather than unit tests.

## Deploy & git

`main` is the production branch — Cloudflare Pages auto-builds and deploys every
push to `main` (`npm run build` → `dist/`). Workflow: branch → PR → merge to
`main` → live in ~1 min. Never commit straight to `main`. Confirm a deploy by
matching the deployed `assets/index-*.js` hash to your local `dist/` (Vite hashes
are content-addressed).

## Gotchas / non-obvious decisions

- **Generation can't be "generate and check"** — random regions are ~0% unique;
  carving + propagation + perturbation are load-bearing. Re-check uniqueness AND
  attempt counts before "simplifying" them.
- **Dev-machine timing is inflated ~3–4×** by the Claude app's own CPU use; trust
  load-independent metrics (attempt counts) over wall-clock ms.
- **Solution secrecy** lives in the worker boundary — keep it there.
- **`verbatimModuleSyntax`** is on — use `import type` for type-only imports.
- **Instant clicks** depend on the `event.detail` model; a double-click briefly
  shows the first click's mark before flipping (unavoidable cost of instant
  single clicks).
