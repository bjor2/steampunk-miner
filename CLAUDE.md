# Steampunk Miner — agent guidelines

An infinite 2D steampunk mining game (Motherload-style, round fully-drillable planets, multiplayer
later). It is a **browser game** that ships to Steam wrapped in **Electron**. Read
[README.md](README.md), then [docs/design.md](docs/design.md); sections 18-28 (data-driven
architecture, testability, logging) and 37 (principles) drive the architecture.

## Stack

Vite · React 18 · TypeScript (strict) · three · @react-three/fiber · @react-three/drei ·
@react-three/rapier · zustand · Vitest · CSS Modules · Electron + electron-builder (npm).

Versions mirror `infernal-bistro` (same owner). The game is 2D: an orthographic camera looking down
-Z at the XY plane, Rapier bodies with Z translation and rotations locked.

## Commands

|                                           |                                                           |
| ----------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                             | Vite dev server (browser)                                 |
| `npm run typecheck`                       | `tsc` for `src/`, `electron/` and the Playwright `e2e/`   |
| `npm test`                                | Vitest (node, no DOM, no canvas; Rapier in physics specs) |
| `npm run test:e2e` / `test:packaged`      | Playwright: preview build / packaged Electron build       |
| `npm run golden:update`                   | rewrite `tests/golden/` after a version bump              |
| `npm run balance:report` / `:baseline`    | pacing bot report vs the committed baseline / rewrite it  |
| `npm run balance:guns`                    | bot to planet 7 with and without `auto_guns` (reported)   |
| `npm run balance:refinery`                | P1-P8 bot with vs without the Refinery bay (#105, logged) |
| `npm run bench:world`                     | `generateChunk` p50/p95 per planet (logged, not gated)    |
| `npm run bench:render`                    | chunk mesh batch p50/p95 per planet (logged, not gated)   |
| `npm run perf:record -- --source bench`   | record bench medians in `docs/perf/history.ndjson`        |
| `npm run art:export -- <asset-id>`        | headless Blender bake + KTX2 encode (art-pipeline.md)     |
| `npm run lint` / `npm run format`         | ESLint (enforces the layer rules) / Prettier              |
| `npm run build`                           | typecheck `src/` + Vite production build into `dist/`     |
| `npm run electron:dev` / `electron:build` | Electron window on the dev server / package to `release/` |

## Git workflow — always, for every agent and session

- **Commit often.** One commit per coherent step, as soon as `npm run typecheck` and the touched
  vitest files are green. Never sit on finished-but-uncommitted work.
- **The message says why**, and what stays the same — not which files moved.
- **Stage by path** (`git add <paths>` / `git commit -- <paths>`), never `git add -A` or `git add .`.
  Other sessions may share the checkout. No secrets staged.
- **Never push unasked.** Push only when the user asks in this session. **Never force-push**, and
  never rewrite commits already on `origin/main`.

## The six rule groups (osilion-dev-tsr3f, in brief)

Full text: [docs/standards/REFERENCE.md](docs/standards/REFERENCE.md); review with
[docs/standards/CHECKLIST.md](docs/standards/CHECKLIST.md).

1. **Function shape** — a function orchestrates or implements, never both. An orchestrator is a
   readable list of named calls (at most a guard, a `try/finally`, returning the last call); loops,
   conditions, maths and string building live in the steps. One level of abstraction; shallow
   nesting; no long inline predicate. Applies to hooks, store actions and `useFrame` bodies too.
2. **Naming** — verb first, game noun after (`packItemIntoBag`). No `handle`, `process`, `data`,
   `info`, `manager`, `util(s)`, `helper`. Booleans read as questions; a boolean argument that changes
   the outcome is two functions. Types say what the thing is (no `...Data`/`...Model`). Comments say
   _why_ or name the ported source.
3. **Modules and state ownership** — one reason to change per module (~300 lines; store ~400).
   Pure rules live in `src/systems/` (no React, zustand, Rapier, `import.meta.*`, clock). One writer per
   external state. Every external system sits behind a seam: Rapier in `src/physics`, time as `dt`,
   persistence behind a checkpoint, Electron/browser APIs in `src/shell`. Scene numbers live in
   `src/constants` with their origin.
4. **Components** — over ~200 lines or two concerns gets split. Bodies hold UI state and one-call
   handlers; markup does not compute. Shared state lives in **one zustand store that owns its
   actions**, selected narrowly; no callback chains, no component refs in modal state. UI kit first
   (`src/ui/kit`); every class lives in a CSS Module beside its component; global sheets hold tokens
   and element rules only (guarded by a test).
5. **Frame loop and physics** — per-frame state stays out of React (refs/registries; zustand holds only
   what the UI renders). No per-frame allocation (scratch in `useMemo`/module scope). Drive motion
   on the fixed physics step, once per step; render delta is for presentation. Never teleport a
   dynamic body; wake bodies that must react to a kinematic mover.
6. **Tests and safe refactoring** — `describe('<area>')` + `it('<behaviour as a sentence>')` on seams
   that survive refactoring (pure `systems/`, store actions). Refactor in behaviour-preserving steps
   gated on typecheck and green suites. Details below and in
   [docs/TESTING_INSTRUCTIONS.md](docs/TESTING_INSTRUCTIONS.md).

## Layout and the rules ESLint enforces

```
src/systems    pure rules; imports nothing above it. No React/zustand/three/Rapier/import.meta/Date.now/Math.random
src/store      the one zustand store; owns its actions
src/scene      R3F components (orthographic camera, XY plane)
src/physics    the ONLY place @react-three/rapier is imported: world, bodies, motors
src/ui         DOM UI; kit/ holds tokens.css, base.css (no classes) and shared components
src/shell      the ONE bridge to Electron/browser APIs (window, URL, keys, page lifecycle, files)
src/logging    append-only event log (design doc 21-24); NDJSON behind a transport seam
src/debug      the scenario/debug API (design doc 19-20)
e2e            Playwright: browser/ on the preview build, packaged/ on the Electron build
tests          committed golden runs (golden/) and the balance-regression baseline (balance/)
src/constants  named scene/balance numbers with their origin
electron/      main + sandboxed preload + typed bridge (CommonJS, compiled to dist-electron/)
```

Repo-specific rules:

- **Keep ported or designed maths literal** and name the design section in the file. A balance constant
  changes because the design changed, never to make a test pass.
- **Numbers** (decision #5): money and every stat that grows without bound is a `Money`/`BigStat` from
  `systems/money.ts`, the only module that touches decimal.js; it crosses JSON as a canonical string.
  Bounded values (ticks, levels, indices, coordinates) are safe-integer `number`s. Economy numbers (prices,
  ratios, hardness, enemy and vehicle coefficients) live in `src/systems/economy/economy.json`, read by the
  pure formulas in `src/systems/economy/`; no such literal appears in code.
- **Authority** (decision #3): world and economy state changes only through
  `applyCommand(state, command)` in `systems/authority/`; store actions `submit` a command and render the
  answering events. No `Math.pow`/`exp`/`log*`/trig, `**` or `Number()` there (ESLint enforces it).
- **Determinism**: all randomness comes from a seed (`systems/seededRandom`, `cellRandom`). Per-cell world
  generation uses the order-independent hash so streaming or multiplayer never changes the world.
  `Math.random()` and wall-clock time are banned from `systems/`.
- **Logging starts at the beginning** (design 37.5): any new gameplay action records its event(s) from
  `logging/eventNames.ts`. The log is append-only; derived analytics are computed from it, never written
  into it. Scenario/debug commands record `debug_command_applied` so they never count as play.
- **Scenarios are refused, never trimmed** (`systems/startScenario`): every problem listed, nothing applied.
- **Data-driven content** (design 18): definitions are data under `src/` consumed by pure rules, not
  `if` ladders in components. Asset discovery via `import.meta.glob` stays in loader modules.
- **The renderer never gets Node.** New capability = new method on `ShellBridge`
  (`electron/bridgeContract.cts`), validated in `electron/ipcHandlers.cts`.

## Testing rulebook (short; the full text is [docs/TESTING_INSTRUCTIONS.md](docs/TESTING_INSTRUCTIONS.md))

- Vitest runs in node: no DOM, no canvas; only physics-layer specs build a Rapier world (rules in the
  rulebook). Run the files for the modules you touched
  (`npx vitest run src/systems`); run all of `npm test` when a change crosses modules.
- Tests live beside the code on seams that survive refactoring: pure `systems/` functions, store
  actions (what an action does to the world), the logging and debug API. Never private helpers, JSX
  shape or class names.
- Set up state through a start scenario or a store action, never by poking private fields. Reset stores in
  `beforeEach`.
- Test deterministic things at two step rates when time matters ("takes the same time at 30 and 144 steps/s").
- No test pins a known bug; a fixed bug brings its test in the same commit. A test that breaks during a
  behaviour-preserving refactor was written on the wrong seam: move the seam, not the code.
- What only the eye can check (look, feel, camera) is verified by hand in `npm run dev` and said in the commit.
- Playwright specs (`e2e/browser`, `e2e/packaged`) drive the game only through `window.steampunkDebug`
  and the launch parameters, and assert state, never pixels (rulebook section 5).
- A golden digest changes only with a version bump and `npm run golden:update`; a missed pacing target
  is a balance finding, never a reason to retune the bot or a constant (rulebook section 4).

## Design principles (design doc section 37)

1. **Infinite does not mean infinite handcrafted content.** Infinity comes from mathematical systems,
   procedural generation, data-driven content, reusable visual families, modular mechanics.
2. **Preserve the simple core loop.** Drill, collect, sell, upgrade, go deeper must stay understandable.
3. **Separate vertical and horizontal progression.** Every progression feature is vertical, horizontal, or
   a deliberate combination — say which.
4. **Testability is a product feature.** Debug API, scenarios, deterministic seeds and automated tests are
   designed early (design 19-20).
5. **Logging starts at the beginning.** Structured event logs enable playthrough comparison, balancing, bug
   repro, AI-agent evaluation, regression testing, multiplayer debugging.
6. **Design for multiplayer early.** Terrain, resources, economy, enemies, core extraction, planet and vehicle
   state all need a deterministic, syncable shape; do not retrofit.
7. **Major progression should be visible.** A new vehicle feature, facility or capability shows in the world
   or on the vehicle.
