# Testing instructions

Read this before writing or running any test in this repository. It is the single place the testing
rules live; `CLAUDE.md` summarises it. Modelled on the `infernal-bistro` rulebook.

## 1. The layers

|        | `npm test` (Vitest)                                                    | `npm run test:e2e` (Playwright)                         | `npm run test:packaged` (Playwright)               |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Runs   | Node, no DOM, no canvas; a Rapier world only in `src/physics` specs    | Chromium on `vite preview` of the production build      | The `electron-builder --dir` output, no Steam      |
| Covers | Formulas, store actions, logging, scenario rules, debug API, collision | Launch, `?debug&scenario=`, digests, snapshot, refusals | Window, run log folder, `--debug-api`, save folder |
| Status | The whole rule layer, plus the golden and pacing gates. Run it.        | Pull requests touching the game (CI `e2e`)              | Nightly and by hand (CI `packaged-smoke`)          |

`vite.config.ts` includes only `src/**/*.test.ts`. There are no component tests and no screenshot
comparisons: what the camera shows and how input feels is checked by hand in `npm run dev` and said
in the commit.

### Where a test belongs

- `src/systems/` – pure rules. No store, React, Rapier, `import.meta.glob`, clock or `Math.random` in the
  import graph (ESLint enforces it). The default home for any rule.
- `src/store/` – what an action does to the world; reset with `resetGameStore()` in `beforeEach`.
- `src/logging/`, `src/debug/` – event stamping, NDJSON, sinks, debug commands.
- `src/physics/` – the physics layer: what only a real collision world can show (no tunnelling
  through intact ground, entering and leaving a stamp-wide bore, digging down and then a level tunnel
  sideways through the scene's fixed-step loop with the real store and authority, #36). Rapier is imported only here (lint). Rules of this layer:
  - Create a plain `@dimforge/rapier3d-compat` world (`await RAPIER.init()` in `beforeAll`) with zero
    gravity, and drive it only through the game's own seams (`createVehicleBody`,
    `createVehicleController`, `createVehicleLoop`); never through `@react-three/rapier`, React or a
    canvas. Reset the store and install a memory run log in `beforeEach` when the loop is used.
  - Step it on `PHYSICS_TIMESTEP`, the same fixed step as the game. Assert outcomes in tiles and
    metres (which tile the vehicle is in, how far from the centre), never exact floats or frames.
  - Anything a pure rule can answer (motion, gravity, swivel, pose quantising) is tested in
    `src/systems/` instead; feel (how driving or the camera looks) stays a hand check.
- `electron/` – no Vitest specs (the main process is thin). Its run-id validation in
  `runLogFiles.cts` mirrors `isValidRunId`, which is tested. The save writer (`saveFiles.cts`) is
  smoke-checked by hand in node; the launch flags (`launchOptions.cts`) and the save folder of a
  debug run are checked by the packaged smoke test (section 5).
- `src/systems/bot/` – the pacing bot; `src/systems/replay/` – `replayRun` and the golden scripts.
  Both are pure and run in node (section 4).

## 2. Conventions

- `describe('<area>')`, `it('<behaviour stated as a sentence>')`, one behaviour per test.
- Set up state through a **scenario** (`useGameStore.applyScenario`, `applyStartScenario`) or a store
  action, never by assigning private fields.
- Time is an argument: tests pass `dt` or an injected clock (`createRunLog({ secondsSinceStart })`).
  Where timing matters, assert the same outcome at two step rates.
- Determinism: seed everything. A pinned-sequence test (see `seededRandom.test.ts`) makes a generator
  change a visible decision; update the pins in the same commit and say why, since every saved seed changes.
- Assert returned values and resulting state, not call order or internals.
- Do not pin known bugs. Do not test private helpers, JSX shape or class names.

## 3. Scenarios and the debug API

A **scenario** is the state a player would have had to earn, written down instead of played for
(design doc 19-20, decision #11 section 4). Files are `scenarios/*.scenario.json`, `scenarioVersion` 1,
validated by `validateScenario` in `src/systems/scenario.ts`. They are **refused, never trimmed**: every
problem is listed (unknown fields included) and nothing is applied. Start fields whose system is not
built yet (`depthBp`, inventory, unlocks) are validated, then refused with a problem naming what is
missing. `coreFragments` fills the platform's core bay (`debug.setCoreFragments`); `enemies` (registered
kind, tier, offset) spawn through `debug.spawnEnemy`; `facilities` (level 1 only) and `platformState`
(it must agree with `coreFragments`) are checked, never applied. `hintsEnabled` (#16) is off unless a
file turns it on, so scenario and bot runs never see hints.

- Applying a scenario submits `debug.*` authority commands (so it replays from `commands.ndjson` and logs
  `debug_command_applied`), then runs its script (`fastForward` steps).
- Browser: `?scenario=<json>` at launch (parsed by `parseScenario`); `?debug` (or the dev build) exposes
  `window.steampunkDebug` (the `DebugApi`), `window.steampunkRunLog()` and `window.steampunkRunCommands()`
  (the NDJSON so far, browser shell only).
- Every wired debug method answers `{ ok: true, ... }` or `{ ok: false, problems }`: `setPlanet`,
  `setPlanetSeed`, `teleportToDepthTiles`, `teleportToDepth(depthBp)` (basis points of the radius),
  `teleportToDock(bay?)` (the `debug.teleportToDock {bay}` command: docked at rest in the Sell bay, or the Upgrade bay when named, no tow, no fee),
  `giveMoney` (a decimal string such as `"1e30"`), `applyScenario`,
  `fastForward(ticks, commands?)`, `snapshot()`, `restore(snapshot)`, and for the vehicle
  `setUpgrade(id, level)`, `setEnergy(units)`, `setHull(hull)` (decimal strings) and the unlogged read
  `vehicleStats()` and `vehicleParts()` (the art part ids the run vehicle draws, #52); for the core, `setCoreFragments(count)`; for combat (#25), `spawnEnemy(kind, tier,
offset?)` (offset in whole tiles from the vehicle), `clearEnemies()`, `freezeEnemies(frozen)` and the
  unlogged read `enemyStatsTable(kind)`; for the ground (#36), `carveCircle(x, y, radius, amount?)` and
  `fillCircle(x, y, radius, amount?)` (mm, amount 0 to 255; a carve credits no ore); for casing (#41),
  `setCasingGrade(grade)` and `lineCasing(x, y, grade)` (one ring round a point of the tunnel axis, in mm,
  marking the rock beside air as lining; the vehicle lays the same rings by itself while it drills). Specs that mine deep (where crawlers live) freeze enemies first
  (`FREEZE_ENEMIES` in `scriptedSession.ts`); combat specs fight in the band-1 corridor of
  `combat/combatFixtures.ts`, where no spawn point is in reach. The `ui` namespace (`ui.setCameraMode('rotating' | 'fixed')`, `ui.setPref(name, value)`,
  `ui.getPrefs()`, `ui.getHudModel()`, `ui.getSellBayModel()`, `ui.getUpgradeBayModel()`, `ui.getBayPresentation()`, `ui.getAudioModel()`) reads the
  screens' view models, the bay screen's shutter, text size and preview framing (#45, #44), the music's layer targets, settings and stinger sequence (#49) and
  the drill voice (`drillVoice`: `casing` while the drill's nose is in lining, #41), and
  changes local presentation only: no command, no log line, no `debugApplied` (#11 amendment 2,
  #33). The `input` namespace (`input.press/release/tap(actionId)`, `input.getBindings()`,
  `input.setBindings(overrides)`) presses actions at the action layer, so a tap submits ordinary
  player commands that replay like real play; bindings are refused whole on any problem.
- Screens (#33): the HUD, platform and settings view models are pure (`src/systems/views/`) and
  tested there; the one DOM check is `src/ui/screenIds.test.ts`, a `renderToString` render (no
  browser) that every `UI_IDS` id is drawn with its model's value. It asserts ids and texts, never
  markup shape or class names. Input specs reset with `resetInput()` beside `resetGameStore()`.
- Run-log specs: every emitted line must pass `runEventProblems` (the schema registry in
  `src/logging/eventNames.ts`); a summary is always `deriveSummary(events)`.
- Money in tests: compare canonical strings (`toCanonical`) or `Money` values; `src/testSetup.ts` registers
  a value-equality tester, so `toEqual(fromCanonical('1.5'))` matches `1.50`.
- Store actions that change world or economy go through the authority: to check that one submits instead
  of writing state, pass a spy `Authority` to `resetGameStore(authority)`.
- Checkpoint specs (#26): the save slot's rules (format, epochs, refusals, digest after a restore) are
  tested on the pure `src/systems/save/`; store specs install an in-memory `SaveSlots` with
  `installSaveSlots(...)`, `await checkpointWrites()` before reading what was written, and simulate quit
  and resume as `resetGameStore()` plus the same slots, then `loadCheckpoint()` and `resumeCheckpoint`.
  Uninstall with `installSaveSlots(null)` in `afterEach`.
- Hint specs (#16, #27): the hint and transmission boards are pure (`src/systems/hints/`) and are
  fed authority moments (a scripted session, or the pacing bot's `listener`); the store specs
  call `startPlaques()` as bootstrap does, install an in-memory `PreferencesStorage` for the
  seen-set, and simulate a reload as `resetGameStore()` plus `adoptPreferences` of the same file.
- Stubs in `src/debug/debugApi.ts` throw `DebugCommandNotImplementedError`; implement them with the
  system they poke, never as a silent no-op.

## 4. Golden runs and the balance regression

- **Golden runs** (`tests/golden/*.golden.json`, #11 section 3): a world seed, a stamped command list
  and the digests the authority logged, under the versions that produced them. `src/logging/goldenRun.test.ts`
  replays each at the fixed step and in 30 and 144 fps frame batches. A digest change with unchanged
  versions fails (bump the version that owns the change); a bumped version fails with "regenerate the
  golden file". Regenerate with `npm run golden:update` and commit the files with the bump. The
  scripts live in `src/systems/replay/goldenScripts.ts`; the spec only reads the committed files.
  CI replays them on Windows too (`determinism`), so digests must match across operating systems.
- **Pacing bot** (`src/systems/bot/`, #29): plays `scenarios/bot-slice.scenario.json` through
  authority commands with the #6 movement-time model. `src/logging/pacingGate.test.ts` fails on a
  missed pacing target (`src/constants/pacingTargets.ts`), an unregistered event or field, a broken
  #2 sequence or more than 4 MB of core events and commands in the first hour. Trips per planet
  outside 3 to 12 are printed, never failed. Do not retune the bot or a constant to make it pass: a
  miss is a balance finding for the Systems & Economy Designer (the lever is `paceScale`).
- **Comparison** (`compareRuns`): `npm run balance:report` writes `balance-report/` and compares the
  run with `tests/balance/bot-slice.summary.json`; differences are numbers, never failures. After a
  deliberate economy change, `npm run balance:baseline` rewrites the baseline in the same commit.

## 5. Browser and packaged end-to-end (Playwright)

- Specs drive the game only through `window.steampunkDebug`, `window.steampunkRunLog()` and the
  launch parameters (`?debug&scenario=<committed file>` in a browser, `--debug-api` and
  `--scenario=<path>` for the packaged build). Assert state and digests, never pixels; no
  screenshot comparisons in the slice. Every browser spec also asserts no console error.
- `e2e/browser/` runs on the preview build (`npm run test:e2e`, which builds first; install the
  browser once with `npx playwright install chromium`). `e2e/packaged/` runs on the packaged game
  (`npm run electron:build`, then `npm run test:packaged`, under `xvfb-run -a` on Linux); each
  launch gets a fresh user-data folder.
- Not covered, by design: vehicle feel, camera, art and audio. Those stay hand checks.

## 6. Before every commit

`npm run typecheck`, the touched Vitest files green (and `npm run lint` for boundary rules). By hand for
anything visual: `npm run dev`, then say what you checked in the commit message.
