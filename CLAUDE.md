## Maintaining Documentation and CLAUDE.md’s, Including This File 
#### (applies to any sub-folders as well if they exist)

This file is a living document. Keep it accurate as the project evolves — do not wait to be asked. A stale CLAUDE.md is worse than a short one.

Update this file when you:
- Discover a command, flag, or environment detail that would have been useful to know earlier in the session
- Establish a new pattern or convention that future work should follow
- Make an architectural decision that affects how new code should be written
- Hit a gotcha or a "never do this" that caused a real problem

**Keep this file short — target under 500 lines.** As the project grows and sections expand, extract them into separate documentation files and add an index entry here pointing to them. Read those files when you need them; do not load them speculatively.
This keeps the context window free and lets the documentation grow without limit.

Example index:
- Architecture decisions: `docs/claude/architecture.md`
- API and data conventions: `docs/claude/conventions.md`
- Testing patterns and commands: `docs/claude/testing.md`

For rules that only apply to specific parts of the codebase, use `.claude/rules/` files with `paths:` YAML frontmatter. These load automatically only when you work with matching files, without any manual lookup needed.

Add a `## Compact Instructions` section to this file once the project is large enough that long sessions are common. Use it to specify what must be preserved when the context window compacts: current branch, modified files, any failing tests, active decisions.


## Project: Crowns (LinkedIn "Queens" clone)

Vanilla TS + Vite, zero runtime deps. Fully client-side, deploys static to
Cloudflare Pages. See `README.md` for play/deploy details.

**Commands:** `npm run dev` · `npm run test` (Vitest) · `npm run build` (tsc +
vite) · `npm run preview`. To screenshot the running app, use the Claude Preview
MCP (`launch.json` defines `crowns-dev`), not `sim-screenshot`.

**Architecture (layering — enforce it):**
- `src/core/` — pure, worker-safe, unit-tested engine. Imports nothing from
  `state/`, `ui/`, `worker/`, `theme/`. Cells are a single index `i = r*n + c`.
- `src/worker/` — Web Worker owns the RNG + solutions; the solution is NEVER sent
  to the main thread. `protocol.ts` is the shared message contract.
- `src/state/` — custom signal store (`signal.ts`). Explicit state = crowns +
  manualX; everything else (autoX/marks/conflicts) is DERIVED. All board
  mutations go through `commit()`/`undo()` (one batch, one transaction).
- `src/theme/tokens.ts` — the ONLY place with color/style literals; flattened to
  CSS variables. base.css and components read `var(--…)` only.
- `src/ui/` — DOM board (CSS Grid) + controls; minimal reactive patching.

**Gotchas / conventions:**
- Generation is the hard part — see the `crowns-puzzle-generation` memory.
  Random regions are ~never unique; we carve + propagate + perturb. Don't
  "simplify" the solver/carve without re-checking uniqueness AND attempt counts.
- Node timing measurements on this machine are inflated ~3-4× by the Claude app's
  CPU use; trust load-independent metrics (attempt counts) over wall-clock ms.
- `tsconfig` uses `verbatimModuleSyntax` — use `import type` for type-only imports.
- Worker file types `self` via a minimal cast to avoid DOM-vs-WebWorker lib clash.

## Compact Instructions
Preserve: branch `feat/crowns-initial-build`; remote `origin` =
github.com/JoelSmith123/crowns (public); PR #1 open (base `main` = M0 scaffold).
All 10 milestones (M0-M9) complete; 20 Vitest tests passing; app verified
in-browser. Deploy: user connects Cloudflare Pages themselves (build
`npm run build`, output `dist/`). Don't re-tune generation perf without reading
the `crowns-puzzle-generation` memory first.

## Git and Version Control

- Never commit or push directly to `main`. All changes go through a branch and pull request.
- Create a branch before touching any code. Use the format `feat/short-description`,`fix/short-description`, `chore/short-description`, `refactor/short-description`, etc.
- Before committing, verify the changes actually work. If anything fails, fix it and re-verify. Never commit broken builds, failing tests, or half-finished logic.
- Commit in logical, working units using Conventional Commits format: `feat: add session timeout`, `fix: correct null check in auth flow`. Keep subject lines under 72 characters; use the body to explain *why* when it isn't obvious from the diff.
- Handle the full development cycle autonomously: branch → implement → test → fix → iterate until passing → commit → push → open PR. Do not pause to ask permission between these steps unless something is genuinely ambiguous, outside the stated scope, or potentially destructive.
- When a branch is complete and verified, push it and open a pull request without waiting for instruction. Write a description covering what changed, why, and any edge cases or testing considerations worth flagging for review.
- If you encounter merge conflicts, resolve them, then re-run tests to confirm nothing broke before continuing.