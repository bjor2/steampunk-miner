# Testing instructions

Read this before writing or running any test in this repository. It is the single place the testing
rules live; `CLAUDE.md` summarises it. Modelled on the `infernal-bistro` rulebook.

## 1. The layers

|        | `npm test` (Vitest)                                                    | `npm run test:e2e` (Playwright)                            | `npm run test:packaged` (Playwright)               |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Runs   | Node, no DOM, no canvas; a Rapier world only in `src/physics` specs    | Chromium on `vite preview` of the production build         | The `electron-builder --dir` output, no Steam      |
| Covers | Formulas, store actions, logging, scenario rules, debug API, collision | Launch, `?debug&scenario=`, digests, snapshot, refusals    | Window, run log folder, `--debug-api`, save folder |
| Status | The whole rule layer, plus the golden and pacing gates. Run it.        | Box Tester per completed spec touching `src/`, and nightly | Box Tester nightly, and by hand                    |

`vite.config.ts` includes `src/**/*.test.ts` and, for the node build scripts (perf recorder,
status dashboard, ticket phase metrics), `scripts/**/*.test.mjs`. There are no component tests and no screenshot
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
- `src/features/<slice>/` – a slice's tests sit beside its code, on the seams of the kernel layer of
  the same name (`systems/` pure, `store/` actions). `src/testSetup.ts` calls `loadFeatures()`, so
  every spec runs with the committed slices registered and the registries sealed. A kernel spec that
  needs a fake registration wraps its assertions in `withRegistrations(slices, run)`
  (`src/registries/registrar.ts`: synchronous, it restores the loaded set) and never imports a
  slice. `src/features/sliceBoundaries.test.ts` proves the boundary lint against `eslint.config.js`.
- `src/systems/bot/` – the pacing bot; `src/systems/replay/` – `replayRun` and the golden scripts.
  Both are pure and run in node (section 4).

### The test manifest

`tests/MANIFEST.md` is the one overview of every Vitest file (the GD lock on #191, #229): each slice
with its files and test counts, the kernel by area (the folder rules of `scripts/ci/testFeatures.mjs`),
and the cross-slice checks the kernel owns (pacing gates and their seeds, the `balance:*` guards,
buyable descriptions, gate classes, endless signatures; listed in `scripts/tests/crossSliceChecks.mjs`).
It is generated from `vitest list` and never edited by hand. `scripts/tests/manifestDrift.test.mjs`
fails when a test file is added, deleted or gains or loses an `it`/`test` call without the manifest
following, and when a slice that ships a scheduled `stats.json` row (a registered entry claiming it)
has no test. It reads files only, so the box Tester runs it whenever a test file changes.

After adding, moving or deleting tests, run `npm run tests:manifest` and commit the manifest with the
tests. It lists only the new and changed files (seconds); pass test files to refresh them too (an
`it.each` table that grew changes no call site), or `-- --all` for the whole suite (minutes, collects
every file). On a merge conflict in the manifest, take either side and run it again.

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

- Applying a scenario starts a fresh session at tick 0 (#11 section 4; live ticks played before it never
  count), submits `debug.*` authority commands (so it replays from `commands.ndjson` and logs
  `debug_command_applied`), then runs its script (`fastForward` steps).
- After a scenario or a `restore(snapshot)`, the live game's fixed step holds at that tick until play
  starts it (ticket 301): any key, an action press (`input.*` too), `fastForward`, `step` or `resume`.
  The HUD shows "Scenario ready — press any key" meanwhile. So `?scenario=` and `applyScenario` land on
  the same tick and digest however long the page takes between two `page.evaluate` calls. A spec that
  wants live play after a scenario presses an action or calls `resume()` first.
- Browser: `?scenario=<json>` at launch (parsed by `parseScenario`); `?debug` (or the dev build) exposes
  `window.steampunkDebug` (the `DebugApi`), `window.steampunkRunLog()` and `window.steampunkRunCommands()`
  (the newest NDJSON lines, up to a million characters per file, browser shell only, #117).
- The title menu (ticket 403) opens on a player's launch and holds the live step until a game is
  picked. A `?debug` or `--debug-api` launch and any scenario start straight into play, resuming the
  autosave as before, so specs never see it; `?debug&title` brings it back, and
  `ui.getTitleMenuModel()` reads it (null once a game is picked) while `input.tap('ui_confirm')`
  presses its focused choice. Store specs open it with `openTitleMenu()` over an installed save
  folder (`src/store/titleMenu.test.ts`).
- Every wired debug method answers `{ ok: true, ... }` or `{ ok: false, problems }`: `setPlanet`,
  `setPlanetSeed`, `teleportToDepthTiles`, `teleportToDepth(depthBp)` (basis points of the radius),
  `teleportToDock(bay?)` (the `debug.teleportToDock {bay}` command: docked at rest in the Sell bay, or the Upgrade bay when named, no tow, no fee),
  `giveMoney` (a decimal string such as `"1e30"`), `applyScenario`,
  `fastForward(ticks, commands?)`, `snapshot()`, `restore(snapshot)`, for the live game `pause()` (the
  fixed step holds until `resume()`, frames still draw), `resume()` and `step(ticks)` (1 to 3600 whole
  fixed steps of the running world now, physics and all, logged as `debug_command_applied`; refused
  while no physics world is mounted), and for the vehicle
  `setUpgrade(id, level)` (the stored step `10L + k` since #181: major 13 is level 130),
  `setEnergy(units)`, `setHull(hull)` (decimal strings) and the unlogged read
  `vehicleStats()` and `vehicleParts()` (the art part ids the run vehicle draws, #52); for the core, `setCoreFragments(count)`; for combat (#25), `spawnEnemy(kind, tier,
offset?)` (offset in whole tiles from the vehicle), `clearEnemies()`, `freezeEnemies(frozen)` and the
  unlogged read `enemyStatsTable(kind)`; for the ground (#36), `carveCircle(x, y, radius, amount?)` and
  `fillCircle(x, y, radius, amount?)` (mm, amount 0 to 255; a carve credits no ore); for casing (#41),
  `setCasingGrade(grade)` and `lineCasing(x, y, grade)` (one ring round a point of the tunnel axis, in mm,
  marking the rock beside air as lining; the vehicle lays the same rings by itself while it drills) and
  `gnawCasing(x, y)` (that ring breached, as a tunnel wrecker's gnaw leaves it, #111); for the guns (#107),
  `setGunLevel(level)` (a step: 0, or the mount 10 to the cap 160, no unlock or price; `vehicleParts()` then lists the
  turret's parts); for blasting charges (#109), `setCharges(carried, slotLevel)` (a bolted-on rack, no
  unlock or price; `vehicleParts()` then reports `rackCharges` and the rack's parts); for the heat planets
  (#113), `setLiningType(type)` (`standard` or `refractory`, owned and laid from then on, no unlock or
  price; `lineCasing` lays the active type) and `setHeat(points)` (the heat gauge, 0 to its max, only 0
  off planets 8 to 16); for the loadout (#162, K4), `setVehicleLoadout(slots, owned?)` (replaces the
  vehicle's loadout: each named slot holds its item, every other slot is empty, and the vehicle owns
  exactly those items and `owned`, with no dock, price or slot lock; it reads registered vehicle
  items, so kernel specs register fakes with `withRegistrations`); for collapse (#43),
  `forceCollapse(block)` (a `cx,cy#index` block, warned for the full 60 ticks, then refilled whatever its
  lining) and the unlogged read `collapseState()` (the weak blocks within 16 m of a vehicle and the blocks
  warning or refilling); for memory (#119), the unlogged read `getPhysicsStats()`
  (`{ rigidBodies, colliders, wasmBytes }` of the running Rapier world; `wasmBytes` is Rapier's WASM
  memory, seen as Rapier loads in a debug run) and `ui.getRendererMemory()` (`{ geometries, textures,
programs }` from three's `renderer.info` of the game canvas), read only when called, for the memory
  soak (#99); both refuse while nothing is mounted; for snapshots (#123), `exportSnapshots()` (a
  promise: in a browser it downloads the kept runs' saves and screenshots from IndexedDB as one
  uncompressed zip and answers `{ file, bytes, entries }`; Electron refuses, its snapshots are files
  under `logs/<runId>/`); for save slots (ticket 404), the unlogged read `saves.list()` (a promise
  of the slot index, autosave first, each entry with its exact playtime tick and wall time).
  Collapse specs build a weak band-2 tunnel or dig one with `collapse/collapseFixtures.ts`. Bore gun specs (ticket 313) stand the rig in a pocket of band-1 rock with `bore/boreFixtures.ts` and register the gun's numbers through `boreGunSlice` inside `withRegistrations`, as no slice answers `boreGun` yet. Auto mode specs (ticket 317) use `bore/boreAutoFixtures.ts` `searSlice`, which adds the steam sear's numbers and its research, and stand the rig at `AUTO_RIG`, on the east edge of its collapse block, so a level shot east never warns the rig's own block. A slice's self-acting item (ticket 328: the steam shield) is specced with the real press path through `power-up-core`'s `withPowerUpCore([itemSlice, fixture])`, the fixture registering the item's research and a stand-in `autoFire` hook for the combo, in the corridor fight of `combat/combatFixtures.ts`. Collapse brace specs (ticket 331) register the fake `brace-probe` slice of `collapse/braceFixtures.ts` (a section, a command, a clock step and the provider) inside `withRegistrations`, so a brace can end by command, by clock step or by `untilTick`. Hazard strip specs (ticket 341) dig straight down the plain line of `render/hazardStrip/stripFixtures.ts`, fixtures placed in metres below the start, at a steady speed frame by frame; the per-frame cost is the sampler's own cost model (`spentUs`), and the wall clock is `npm run bench:strip`'s. Specs that mine deep (where crawlers live) freeze enemies first
  (`FREEZE_ENEMIES` in `scriptedSession.ts`); combat specs fight in the band-1 corridor of
  `combat/combatFixtures.ts`, where no spawn point is in reach. The `ui` namespace (`ui.setCameraMode('rotating' | 'fixed')`, `ui.setPref(name, value)`,
  `ui.getPrefs()`, `ui.getHudModel()`, `ui.getSellBayModel()`, `ui.getUpgradeBayModel()`, `ui.getRefineryBayModel()` (#105), `ui.getBayPresentation()`, `ui.getAudioModel()`, `ui.getScreenLayout()` (#173: the stage, `--ui-scale`, the TV safe inset, the smallest control and the bay-screen text size), `ui.getPauseMenuModel()` and `ui.setPauseSaveName(name)` (ticket 404: the pause menu, null while closed, and the name its next save takes)) reads the
  screens' view models, the bay screen's shutter, text size and preview framing (#45, #44), the music's layer targets, settings and stinger sequence (#49) and
  the drill voice (`drillVoice`: `casing` while the drill's nose is in lining, #41), and
  changes local presentation only: no command, no log line, no `debugApplied` (#11 amendment 2,
  #33). The `input` namespace (`input.press/release/tap(actionId)`, `input.getBindings()`,
  `input.setBindings(overrides)`, the unlogged read `input.getActionStream()`: every action
  pressed and held one released, oldest first, from keys, touches, the pad and the API alike, #173,
  and `input.padFrame(frame | null)` / `input.getPadAim()`: a polled gamepad frame as the shell hands
  it over, and the right stick's aim the bore gun reads, ticket 346) presses
  actions at the action layer, so a tap submits ordinary
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
  Uninstall with `installSaveSlots(null)` in `afterEach`. The exact round-trip (ticket 405) saves
  through JSON text and reads back with `readSaveSlot`: `saveExactRoundTrip.test.ts` holds money and
  prices to decimal text, the cut cursor, a bore mid-shot, the cache's offer, the codex's firsts and
  the opened rows; `saveDeterminism.test.ts` saves the planet-200 dive of `p200DiveFixture.ts` (a
  crew of eight, so the steps are cut by the swept span, and a drill under the curve, so the cursor
  holds part of a tick) and plays 600 ticks on from the save and from its load, compared byte for byte.
- Drill carry specs (ticket 399): the pure walk is `vehicle/carryWalk.test.ts` (exact sums over a
  column, hard stops, the carry ends, runs equal to the per-cell walk, no gate asked past the stop);
  `authority/sweptCarry.test.ts` drives `drillAlongStep` down a 100-cell column (each cell breaks on
  tick `ceil(running total of prices / 60)`), compares the live, run-length and per-cell walks byte for
  byte at 1x, 10x and 100x a P40 rig's stride, and checks the carry is 0 where core, a hazard, a full
  hold or a dry tank ends a tick's walk. Since the work picks how far a tick cuts, a flag-on fixture
  whose pose runs ahead of the cut rests at its end while the cut catches up (`sweptSpanFixtures.ts`).
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
  The second slice's runs (S11, #65) live in `src/systems/replay/secondSliceGoldenScripts.ts`:
  casing (a grade-2 bore in band 2, then `debug.forceCollapse`), collapse (a grade-1 dig into band
  2), the two bays (`wrong_bay` both ways) and the artefact cache (live on planet 1, a husk on
  planet 2). `src/logging/secondSliceGolden.test.ts` replays each committed file and checks it still
  shows what it is named for, and that the husk's chunk digest equals a player's who holds nothing.
- **Pacing bot** (`src/systems/bot/`, #29): plays `scenarios/bot-slice.scenario.json` through
  authority commands with the #6 movement-time model, buying casing grades on-curve (grade `b`
  before it mines band `b`, grade 5 before the core, S11). Its scripted mining (`drillTile`) lays
  casing through the player's placement code, one ring per metre, and the lining bill is settled per
  Sell bay visit (#115, #128); the pacing specs fail a drill dive that lays no ring (a span's
  `casing_lined` rings or a `casing_placed`) and a slice that
  forgives more than a tenth of the lining it charged. `src/logging/pacingGate.test.ts` fails on a
  missed pacing target (`src/constants/pacingTargets.ts`), an unregistered event or field, a broken
  #2 sequence or core events and commands in the first hour over 1.3x the bytes ticket 420
  measured with drill spans folded (about 2.4 MB, never above #11 am. 2's 4 MB; it prints the bytes
  a cell too); it also fails a
  seed-median planet 1 drill under 3x its start band-1 speed when it first breaks a band-3 tile, or
  under 10 band-1 cells/s on arriving at planet 2 (`planetOneDrillPace.ts`, ticket 396).
  `src/logging/logCompactionBotHour.test.ts` (nightly only, ticket 420) plays the bot's first hour
  twice, its drill spans folded and with one line per cell (`drillLines: 'cells'`), and fails unless
  the domain events are identical, the logged commands expand back exactly, every unfolded line is
  byte for byte the same apart from `seq`, and the pacing report, planet 1 drill pace, dive casing,
  summary and money lane read the same off both. `src/logging/drillLogBytes.test.ts` drills a
  synthetic hour of 60 Hz `drillStep` with 5 Hz poses through the NDJSON sink at 1x, 10x and 100x
  the planet 1 band-1 speed: events plus commands within 5% of each other and at most 6 MB.
  `src/logging/assayPacingGate.test.ts` holds the bot holding `assay_beacon`
  (`bot-slice-assay.scenario.json`) to the same three gates: the #16 first ten minutes, the planet 1
  core in 15 to 30 minutes and the slice in 40 to 130 (ticket 396's windows, slice edge per #418; `pacingVerdicts` prints pass or fail for each). Trips per planet
  outside 3 to 12 are printed, never failed. Both play their scenario on three world seeds
  (`src/constants/pacingSeeds.ts`, the scenario's own `worldSeed` first) and gate on the median of
  each metric (`medianPacingReport`, #84), so one run's combat deaths cannot flip a gate; the log
  checks, the baseline and `compareRuns` stay on the first seed. Do not retune the bot or a constant to make it pass: a
  miss is a balance finding for the Systems & Economy Designer (the lever is `paceScale`).
- **Drill-speed ladder** (ticket 409): `src/logging/drillLadder.test.ts` cuts the same 50 cells
  straight down from the planet 1 surface (seed 83921, column 20) at drill_power majors 1, 5, 10,
  15 and 20 through the authority's swept cut (`systems/authority/drillLadder.ts`: the #396 drill
  law with #399's exact carry, a full tank and a hold that never fills, enemies frozen). It prints
  the table (ticks, seconds, cells/s, gain on the level below beside the law's gain), writes it to
  `balance-report/drill-ladder.ndjson` (a setup line, then one line a level) for comparing runs
  across commits, and fails a step that is not faster or keeps less than the law's 1.12 a level
  compounded, less the GD's 5% (`drillLadderReport.ts`, compared in Money). The cut alone sets the
  time; #397's cut-follow adds the vehicle's travel. About 4 s, so it runs in the change-relevant
  tier. The table and how to read it are in [docs/economy/drill-ladder.md](economy/drill-ladder.md).
- **Cut start latency** (ticket 433, measurement only): `src/physics/cutStartLatency.lane.test.ts`
  starts a down cut from rest in the live loop with `drill.sweptCut` on (from the planet 1 surface,
  turning the head from left, and again mid-shaft), at stored drill_power 1, 10 and 20, #400's rig
  1 and #397's 15 m/s rig (rig 2 cuts at 3600 m/s since #397 and leaves no rest start mid-shaft),
  at 30 and 144 frames/s. It prints where the ticks go until the body follows the drill
  (swivel, stale facing, first cell, held, second stall: `systems/vehicle/cutStartBreakdown.ts`)
  and the stale facing for each pose report phase, and writes them to
  `balance-report/cut-start-latency.ndjson`. A lane (about 40 s), so it runs only when named; it
  fails only when a start opens no cell or the two frame rates differ.
- **Fast-rig body speed** (ticket 440, measurement only): `src/physics/fastRigBodySpeed.lane.test.ts`
  plays #400's down leg in the live loop with `drill.sweptCut` on, at stored drill_power/tip
  250/600, 300/200 (#400's rig 1), 320/600, 330/600 and 350/600, at 30 and 144 frames/s, and traces
  every tick: the read's `vCut`, the speed the motor commands, the body's speed over the tick and
  after its contacts, the step bound, the substeps, the cut's reach past the body and the gate. It
  names each steady cut tick that falls more than 5% short of the commanded speed by the ground in
  the slab the commanded move sweeps (`systems/vehicle/bodySpeedDips.ts`): stale halo (ground the
  tick's own cut opened), uncut ground (still standing after the cut) or unexplained. It writes the
  trace to `balance-report/fast-rig-body-speed.ndjson`. Under #396's 4-tick floor every rig cuts at
  15 m/s, and the rigs reach 25 to 78 m/s only once #397 takes the floor out. A lane (about 20 s),
  so it runs only when named; it fails only when a rig has no steady cut tick or the two frame rates
  differ.
- **Drill-speed ladder in stored steps** (ticket 434): `src/logging/drillLadderSteps.test.ts` cuts
  the same column's first 20 cells (all band 1, the ground a 10 s hold reaches) at stored drill_power
  steps 1, 5, 10, 15 and 20, the levels of the browser drill-down run, with the law counted per step
  (`drillPowerAtStep`). It watches: it only checks that the whole column was cut and no step cut
  slower. Its rows go to `balance-report/drill-ladder-steps.ndjson`, which the Tester's
  `pushTestMetrics.sh` appends to `drill-ladder.ndjson` on `test-metrics` for the status page's
  Drill speed panel ([loop-status.md](loop-status.md#drill-speed-panel-ticket-434)). About 2 s.
- **Cut-follow at the starting drill** (ticket 430): `src/physics/cutFollowStartingRigs.test.ts`
  plays 8 s legs down, level and up in the live loop with `drill.sweptCut` on, at stored
  drill_power 1, 10 and 20 (tip 0) and #400's two rigs, and holds a down cut to the drill's speed
  (95% of the ticks within 5%, none under 80% or backward) past its start from rest (#433's first
  cell, held and second stall), up and level to main's shares (79%, 42%), the motor gate to the
  authority's and 30 and 144 frames/s to one path (about 40 s). The commanded speed is the open
  gate's `vCut`, carried through a shut gate and a cleared slab. `src/physics/cutFollowRelease.test.ts`
  lets go of a followed cut at every tick of a cell's cycle (a fresh rig a phase) and wants the body
  stopped within 6 ticks (about 5 minutes). Both share the rig of `src/physics/cutFollowFixtures.ts`.
- **Body-wide bore at any cells a tick** (ticket 439): `src/systems/authority/sweptFreshCarve.test.ts`
  cuts planet 1's column and its tilted radius with rigs named by their band-1 cut speed (25 to
  3600 m/s, the drill found by `subStepsPerTile` in `sweptRigFixtures.ts`), a tick count to the
  core. No 125 mm station of a faster rig's cut may be narrower than the 25 m/s rig's narrowest once
  the reach is a stamp radius past it, and the ground a tick's cut leaves must let the body's 0.9 m
  face on at least 80% of its next step (off the start lip on both legs, every tick down the column;
  every tick down the tilted radius is a todo on #421's hold-out). The span must equal the per-cell
  walk from the fresh tick, refused rim and centre cells are reported once, no faster rig opens fewer
  cells or less work a metre than the 44 m/s one, and at most 1.20x the cells and 1.30x the work: a
  regression ratchet that #441's band replaces. `src/physics/sweptFreshCarveLoop.test.ts` plays
  stored rigs 370/600, 450/600 and 2000/600 off the pad and down at 30 and 144 frames/s: never more
  than 6 straight cutting ticks at 0 m/s, at least 50 m down, one path for both rates (about 20 s).
- **Known red** (ticket 419, the TD on #396 section 2): `CAMPAIGN_PACING_KNOWN_RED`
  (`src/constants/knownRed.ts`) is the one known-red marker in the repo: one gate
  (`campaignPacingGate`), one finding (#417), no registry. The gate still runs in full;
  `knownRedVerdict` (`src/logging/knownRed.ts`) prints its stalled-seed and sawtooth problems as
  `known-red (#417): ...` instead of failing them. The schedule cadence and "judged nothing" always
  fail, and the marker never covers `pacingGate`, `assayPacingGate`, the schedule, hash or growth
  asserts. The marker itself fails when it names no finding ticket, when the finding's
  `docs/metrics/tickets/<n>.json` shows `closed` (it expires with the finding), and when the gate
  is green (delete the marker in the commit that turns it green). `knownRed.test.ts` fails on a
  second exported marker: a new one needs a ruling and a code review, not a copy.
- **Guns** (#107 acceptance 5): `npm run balance:guns` plays the bot to planet 7's core with
  `auto_guns` (mounted on planet 4) and without, and prints planets 4 to 7 side by side with each
  planet's gun energy and kills from the dive summaries (`deriveDiveSummaries`). Reported, never gated;
  a planet that moves by more than 10% is a balance finding whose one lever is
  `gun.damageFractionOfDrill`. Gun combat specs fight in the band-1 corridor with `debug.setGunLevel`
  and the planet 4 on-curve levels (`combat/gunFire.test.ts`).
- **Bore gun** (ticket 347, the TD's seam 3 on #314): `npm run balance:bore` plays the bot scenario
  to planet 10's core on each pacing seed twice, never firing the bore gun (`borePolicy: 'never'`,
  the default) and forced (`'forced'`: the gun mounted at its walls through the provider's
  `wallsMountIntent`, a shot at every `nextShotTick` aimed by `bestBoreBearingOf`), and
  `logging/boreReport.ts` gates the forced run: time to core at least 0.98x the never run's on
  every planet and seed, departure `drill_power` within 1 level, at least 60 shots, and the
  campaign scaling gate. It exits 1 on a miss; `-- --last-planet 40` plays the headless lane at
  the #304/#330 re-baseline. The bot's cadence (`waitFiring` splits its 60-tick waits at
  `nextShotTick`) is pinned in `systems/bot/botBore.test.ts`.
- **Refinery** (#105 acceptance 7): `npm run balance:refinery` plays the bot scenario from planet 1
  to planet 8's core twice, refining from planet 3 (`refinery: 'used'`, the bot's default) and
  ignoring the refinery, and prints both core times per planet, the single-lever findings
  (`refineryLeverFindings`: a planet pushed under 45 minutes or shortened more than 10%) and the
  realised refine gain per planet from `refine_collected`. Reported, never gated; the lever is
  `valueMultiplier` (floor 1.15), never `k_casing`.
- **Blasting charges** (#109 numbers acceptance 3 and 4, sizes K8 #218): `npm run balance:charges`
  prints the blast trade (`blastTrade.ts`: per band of planets 7 to 10, drill time over the floor,
  ore money a minute drilling against blasting, and 3 tiles of shaft either way, for the on-curve
  drill and one 12 levels behind), then the size guard (`chargeSizeTrade.ts`, #143 guard 1: every
  size on its unlock planet and planet 40, every band, at 24 and 45 ticks a tile, a blast's net ore
  money a minute against the drill's at the band's density and centred on a full patch), then the
  payoff guard (`chargePayoff.ts`, #143 guard 2 as the GD lock on K8 #218 wrote it: one `minCharge`
  on a +1 or +2 dynamite-gated lead patch in bands 3 to 5 of planets 7 to 40 and 50, the patch cells
  inside the radius at the lead tier over the charge's price, expected at 2 or more, with #142's 15%
  share cap beside it for information; #148 gates the bot's `gate_cleared` medians), then the same
  guard under #142's share model (`chargeSharePayoff.ts`, ticket 247: every open size up to the
  band, in each band the seed's gate table gives dynamite-gated lead cells on planets 7 to 40 and
  50, the gated value one charge frees capped by the 15% guard over its price; the table's shape
  is the snapshot in `logging/chargeSharePayoffReport.test.ts`), then plays
  the bot scenario to planet 40's core on each pacing seed blasting (the bot's default) and never,
  and prints both median core times per planet, the blasts and whether each is inside C4: planets 7
  to 10 judged, 13 to 34 and 40 diagnostic until #148. Last, the dynamite gate (GD lock on #148,
  ticket 236, the GD ruling on ticket 237): the shells each seed's blasting bot freed
  (`mining-gates.gate_cleared {gateKind: dynamite}`) on planets 7, 10, 16, 22, 28, 34 and 40 beside
  each seed's dynamite-gated tiles (the debug action `dynamiteCellsOf` generates the planet). The
  median over the seeds with such tiles is expected at 1.5 or more where at least 2 seeds have
  them; a planet with 1 is an insufficient sample, with none n/a; at least 4 planets are judged,
  one from planet 28 on. Beside it the payback (#218's 2x figure, reported: the freed value over the
  price of the charges that freed them) and the (planet, seed) pairs with no dynamite cells, the
  extractor row (148d #296: a median of 1.5 or more extractor-gated cells freed a run on each of
  those planets), when each seed's bot bought each extractor (#142 acceptance 7: on its own planet
  by the end of trip 4, a trip ending at the Sell bay; `logging/extractorPurchaseTrips.ts`; the bot
  buys an offer marked `isBoughtBeforeTracks` ahead of its tracks and saves for it, spec
  `features/mining-gates/systems/botExtractorBuys.test.ts`), the dynamite dry runs (ticket 296,
  report only: planets 7 to 60 of a dynamite act read from its families, n/a elsewhere, each
  seed's longest run of them with no dynamite cells flagged past 2, one dry on every seed a
  content finding; `logging/dynamiteDryRuns.ts`), and `gate_blocked_no_route` per seed: gated walls on the bot's way
  down (pad path, shaft, jog) nothing it carries or buys opens and its shaft found no clear column
  to step round (`bot/botShaft.ts` jogs round them as round lava), expected 0
  (`bot/gateRouteBlocks.ts`, `SliceRun.gateRouteBlocks`; the jog spec is
  `features/mining-gates/systems/botShaftJog.test.ts`). The tally and the tables are
  `logging/gateClearTally.ts`, `gateClearTables.ts` and `gateRouteStalls.ts`, with their specs. Reported, never gated; the one lever is the price per charge. The band-density guard is also a spec (`bot/chargeSizeTrade.test.ts`). Charge
  specs stand in band-2 rock with `charges/chargeFixtures.ts`, and the size specs in solid rock of
  the planet their size opens on (`sizedBlasterOn`); the bot's blasting run starts on planet 7 with
  a stocked rack and a lagging drill (`bot/botBlasting.test.ts`). The bot buys charges only on a
  planet where it met a tile it would blast with none in stock (#129, `bot/botChargeNeed.test.ts`:
  an on-curve run plays exactly like `chargePolicy: 'never'`); the stuck rule buys size 1 and the
  bot plants only fused sizes. From the mining gates (#236, `bot/botGates.ts`) the bot reads the
  drill's gate verdict before it bores: a refused or blocked cell is a wall, and a dynamite-gated
  shell is blasted with the smallest carried fused size that frees it, else its size is what the
  next restock buys (`mining-gates/systems/botGates.test.ts`, on planet 7's generated shells). A
  wall its own extractor opens (a tune, an etch, a pull: the verdict's `opensAfterTicks`) is
  touched and waited out, then bored or entered (`mining-gates/systems/botExtractors.test.ts`);
  the verbs themselves are specced on generated cells with `extractorFixtures.ts`. Gate
  specs name a gate-table entry as a cell at a tile of its band, or scan the generated world for
  one (`mining-gates/systems/gateFixtures.ts`).
- **Heat** (#113 acceptance 4): `npm run balance:heat` plays the bot scenario to planet 10's core
  and prints planets 8 to 10 (`heatPlanetLines`): each core time against the campaign's 45 to 60
  minutes (C4), when refractory was unlocked, the refractory laid, the throttle and heat-damage
  episodes, lava touches and lava a refractory ring stopped. Reported, never gated; the one lever is
  the `bandHeat` scale (0.8 to 1.2), never `k_casing`. The run is played on the three pacing seeds:
  the heat table is the first seed's, and the attrition table (#198, `attritionReport.ts`) prints
  every seed's P8–P10 core time, trips, deaths and deaths per trip with the medians, and lists what
  misses #198 (median above 0.15 or a seed above 0.25 deaths a trip, a stall, P9 under 30 minutes,
  P8 or P10 outside 45 to 60). It then lists the slice report rows for every seed and planet: the
  `power-up-core.marks` rows put each P3–P10 core time beside its Marks-off time and the Mark spend
  and effect (#249). Heat specs drill band 5 of planet 8 straight
  above the core (`heatRun.test.ts`); lava specs find a pocket's floor in band 3 of planet 8
  (`lavaFlow.test.ts`, `lava/lavaRun.test.ts`) and build refractory rings with `debug.lineCasing`;
  breach specs find a generated pocket lying against an open cave cell and gnaw a ring lined in
  plain ground near it (#133: a breach frees only lava a refractory lining kept out).
- **Pace arrival** (tickets 354 and 356): every pace harness (drill gear, twin bit, magnetic planet,
  terrain magnets, no free cell) arrives through `bot/paceArrival.ts`: the on-curve levels, a little
  money and the on-curve hull mended whole, since `debug.setUpgrade` keeps the planet-1 hull of
  100 HP. `arrivedPaceSessionOn` refuses an arrival whose hull is neither whole nor a `NamedHull`
  the spec passes on purpose (`paceArrival.test.ts`). A new pace harness starts there.
- **Twin-bit head** (GD lock on #257, ticket 281): `npm run balance:twin-bit` runs
  `features/drill-gear/twinBitPace.test.ts`: the bot arrives on planets 7 and 10 on-curve and plays
  to the core on each pacing seed with the head in `drill.head` and with the same loadout command
  slotting nothing. Gated twice on the same runs: the median core-time ratio stays at or above 0.98
  (the #205 assert, `drillGearPace.test.ts`), and with drive 0 the head mines exactly the bare
  run's cells, ticks and ore value (no free cell, GD ruling on #280). The scenario
  `drill-gear.twin-bit-diagonal` (`drill-gear/systems/twinBitDiagonal.ts`) is a `fastForward` script
  from the debug action `features['drill-gear'].twinBitDiagonal()`: P19 on-curve with the head, a
  down-right and a down-left bore of six cells from the surface east of the pad. The eye check in
  `npm run dev` plays it from the console: take `s` from `twinBitDiagonal()`, then call
  `steampunkDebug.fastForward(s.ticks, s.commands)`.
- **Drill-gear fork, Deep** (GD lock on #255, ticket 268; GD ruling on #392, ticket 392):
  `features/drill-gear/forkDeep.pace.test.ts` plays the bot from on-curve arrival to the core of
  planets 16 and 20 on the three pacing seeds, once with Deep chosen and once unchosen with the
  bot's own fork pick switched off (`withoutPacingBotForkPicks`, since the on-curve bot chooses Deep
  once its wallet pays), both through the same rich wallet and back to the arrival money
  (`forkDeepPaceRuns.ts`). The bot's scripted bore cuts with the drill gear (protocol 74), so the
  cell Deep opens below the bored one is one the bot drives into. Gated on the seed medians (#84):
  the speed-up above 1.02 (measurably faster), and Deep's travel (reported drive and thrust ticks,
  `systems/travelShare.ts`) at or under a quarter of the run, or no higher than the bare run's.
  One drill step (x1.225) is never a cap (GD ruling on #392): a median past it is printed as a
  balance finding for Systems, never failed, and never a reason to patch the bot. The lane
  `forkDeepP40.lane.test.ts` runs the same gates on planet 40, the headless check of the
  re-baseline. A quick case checks the plunge crown inside the `aheadCells` = 1 clamp, and
  `systems/deepParity.test.ts` that the cell past the bit costs its own drill ticks from the bot's
  bore and the player's cut alike on planets 1 to 20. Wide's flank cells are drill throughput, not
  income, so they register no income rate and the 15% cap never judges them (GD ruling on #385);
  `incomeCapGolden.test.ts` keeps every `gear.*` item out of `incomeRates`. Long: for the box
  Tester.
- **Magnetic planet** (GD lock on #258 Q7, ticket 294): `npm run balance:magnetic-planet` runs
  `features/planet-mix/magneticBandValue.test.ts` and `magneticPlanetPace.test.ts`. The class
  switches off at the same planet index with `withMagneticClassOff` (`magneticClassOff.ts`): the
  loaded registrations without planet-mix's `magneticGround` provider, all else equal. Value: each
  band's generated ore value on P25, P28 and P32 stays within #141's +4% of the class-off planet,
  on every pacing seed. Pace: the bot arrives on-curve and plays each planet to the core on each
  seed with the class off, on with a bare head, and on with the dielectric bit; on the median of
  the per-seed ratios to the class-off run, the bare run takes 1.00x to 1.10x the time, the bit run
  at least 0.98x, and income per minute on the magnetic run is at most +15%. The bot's pilot sets
  its pose, so the field's tug never reaches it; the runs measure shock ticks and hull. A slow
  planet's first lever is `magnetic.electrifiedShareBp`, never the shock time. The slice and P1
  core pins stay `logging/pacingGate.test.ts`'s.
- **Terrain magnets** (GD lock on #246, build 6, ticket 287): `npm run balance:magnets` runs
  `features/terrain-tools/magnetPace.test.ts`: the bot arrives on planets 7 and 10 on-curve with
  the hull whole and plays to the core on each pacing seed with an empty loadout and with the
  repulsor coil and lode clamp granted through the debug loadout. The kernel bot presses no slot,
  so the family run plays the unchanged bot through `withMagnetHand` (`terrain-tools/magnetHand.ts`),
  a session that taps the coil and presses the clamp before each wait out of the dock whenever a
  dry run accepts it, the slots taking turns once a second (`magnetHand.test.ts`). Gated on the
  median of the per-seed ratios: time to core at least 0.98x the bare run, income per minute at
  most +15% (`magnets.incomeCapBp`), and both members act on every seed. A fast family's first
  lever is the magnets' energy draw, never ore price. The family's one #212 row is the registered
  spend family `terrain-tools.terrain_magnets` (ticket 370), which `balance:tree` prints.
- **Tech-tree spend guard** (spec #161 acceptance 6, ticket 212): `npm run balance:tree` runs the
  lane `features/tech-tree/treeSpendGuard.lane.test.ts`. The bot plays the bot scenario to planet
  60's core on each pacing seed, headless and keeping only its spend records, so the guard sees
  P2-P20, P21-P40 and the P41-P60 endless sample. On each planet the tree's share of what the bot
  bought (node research, Marks and combos included, plus the tree-unlocked items; travel never
  counted, a restock in the denominator only) is judged on the median of the seeds against its
  band in `tech-tree.economy.json` (`tech.spendGuard`: 10-30% from P2, 10-25% from P21); planet 1
  is not judged. It fails on a planet outside its band and on a seed short of planet 60's core,
  and prints each seed's share beside the median. The rule is `systems/treeSpendGuard.ts`, with its
  spec. A miss is a balance finding; the levers are #161's, in order: `kMark` 4 to 3, items 15 to
  12 u, `kCapability` 12 to 10, then (endless only) M = 6 from P41. Beside it, report-only, each
  spend family's median share per planet from the kernel `spendFamilies` registry
  (`systems/familySpendShares.ts`): `terrain-tools.terrain_magnets`, `ground-gun.armoury` and the
  kernel turret mount `kernel.buy_gun`, which also counts once in the gated numerator (ticket 371).
  Every live family prints on P2/P10/P20/P40 even at zero. A family counts on a seed only when
  that run ended with its anchor row unlocked. The family rows are not gated (GD ruling Q4); their
  share pins are (`systems/familySharePins.ts`): the armoury's recurring gun-track spend (track
  levels, lane nodes, modules and Marks; never a one-time mount) stays at or under 5% of every
  planet's spend on the seed median (Vertical Scaler on #322, GD ruling on #371), and the lane fails
  on a planet over it. On the same runs the lane gates the 15% income cap (#385 ruling 6167240683,
  `systems/incomeCapCheck.ts`): every income item registered in the kernel `incomeRates` registry
  (the drain; the ore-shifter, pocket lance and lodestone as the ore value they relocate), at full
  stack, brings in one trip (the drill's minutes to fill the hold) at most
  `tech.incomeCap.maxShareBp` of a full hold of the band's ore after `tripCapAt`, on P10, P20, P40
  and P60, every band, at the levels the bot arrived with and left with, on the median of the seeds
  that own the item when their run ends, in whole basis points. An item over the cap before the
  clamp fails unless play pays it through the trip ledger; `tech.incomeCap.knownRed` lists items
  known to fail until their ledger work lands, printed and not gated, and is empty since the movers'
  ledger (ticket 408, `terrain-tools/moverLedger.test.ts`). A band the tip only skids on is not
  judged. The lane also fails an item over 15% of what the bot earned on any planet of the run
  (`systems/deliveredIncomeShares.ts`, the Vertical Scaler's guard), and `incomeCapGolden.test.ts`
  pins the shares on the on-curve vehicle. The **Mark milestone cap** (GD lock on #256, ticket 278) judges the same runs the same way with each item's sibling-link added to it
  (`milestoneIncomeCapVerdictsOf`): every income item at Mark 9 and past, fully stacked, the link
  on and the sibling slotted and ready, owned whatever the bot bought; a rate whose last Mark
  reaches its link says what the link adds (`linkValuePerMinuteAtFullStack`, today only the
  ore-shifter's half-cap lodestone beacon; the pocket lance's splitter fissure moves no ore).
  `npm run balance:tree -- --milestones` (`scripts/balanceTree.mjs`) runs only that check; the
  golden pins its shares too and guards that every item reaching a link declares it. Its
  non-yield checks are unit specs on the three pacing seeds: the drain's second tap takes the
  same cells and ore as a plain use (`extraction/systems/nonYieldVerbs.test.ts`), and no terrain
  tool's hold or second tap moves more ore or edits more cells in a use than a plain use may
  (`terrain-tools/systems/nonYieldVerbs.test.ts`). Also
  report-only, each of the six lanes' median share of every planet's spend, zero included
  (`laneShareRowsOf` in `systems/nodeSpendShare.ts`, ticket 266): lanes carry no bands of their own
  (GD ruling Q4 on #212), so the sixth lane's share comes out of the gated tree total. Gated beside
  the runs, the **loadout yield cap** (GD lock on #245, ticket 266; `systems/loadoutYieldCap.ts`,
  unit-tested in `loadoutYieldCap.test.ts`): every income rate registered in `incomeRates`, all
  items owned at their last Mark, sums to no more than the same rates outside the Aetheric lane at
  the on-curve vehicle of P10/P20/P40/P60, band 5; the lane's items and its combos add zero and
  carry no income ladder or income item hook.
- **Lane forks** (GD lock on #255, build 2; ticket 267): `npm run balance:forks` runs the lane
  `features/tech-tree/forkMix.lane.test.ts`. For every registered fork branch, the bot plays the bot
  scenario to planet 10's core on each pacing seed, forced onto the branch from the start: the
  debug command `debug.tech-tree.forceFork` makes it the lane's active branch outside its P16 tier,
  the debug loadout slots its item, and `withForkHand` (`features/tech-tree/forkHand.ts`) presses
  that slot once a second out of the dock whenever a dry run accepts it, as the magnet hand does.
  The run is folded step by step into a pace tally and an action-mix tally
  (`systems/forkPace.ts`, `systems/forkMixTally.ts`); only those are kept. Gated per branch on the
  seed median: P8 at 45 minutes or more and the slice at 100-110 (#146's pins); per pair, the two
  slice medians within 10%, and the lane's action-mix metric apart between the branches
  (`systems/forkMixMetrics.ts`: flank share of cut cells, airborne share of action ticks, reach
  share of cargo, wide pings per trip and cone reads per cut, blast share of opened cells, phased
  share of descent cells and arc share of enemy damage). The aetheric parts read the verbs' own
  events (ticket 391): a downward phase counts once `aetheric.PhaseLanded` follows it, and an arc's
  damage is its `aetheric.ArcFired` hits. A pair that differs only in stats fails, and a run that
  leaves out the aetheric pair fails.
  It refuses to run with no pair registered and prints a row per run (slice, P3-P10, the action
  mix), a median row per branch and the lanes with no pair. The verdicts are unit-tested in
  `forkMixReport.test.ts`; a short forced run in `forkMixRuns.test.ts`.
- **Aetheric pace re-run** (Systems on #245, ticket 266): the lane
  `features/tech-tree/aethericPace.lane.test.ts` plays the same forced run with the bot forced onto
  the whole Aetheric lane, once per P16 branch, on each pacing seed to planet 10's core: the branch
  forced, the lane's other capabilities owned (`laneSeedRunOf`), the earliest two in the slots
  open on a new vehicle and pressed in turn (`withForkHands`). Gated per branch on the seed median
  (`systems/lanePace.ts`): P1 core within 58 minutes of the start, the slice at 100-110 and P8 at
  45 or more (#146's pins). Run it by name; a miss is a balance finding for the lane's items.
- **Turret module pace** (the GD ruling on #319 with the VS conditions, ticket 388): the lane
  `features/ground-gun/turretPace.lane.test.ts` plays the bot scenario to planet 40's core on each
  pacing seed once never firing, then forced to fire the bore gun at its walls with the bot
  mounting the turret when offered, once bare and once per auto_guns module owned from the start
  (`gunPaceRuns.ts`, shared with ticket 380's `shapePace.lane.test.ts`). Each run is held to
  `balance:bore`'s pins (time to core at least 0.98x on every planet, departure drill_power within 1
  level, the campaign scaling gate) and the worst module gates. Run it by name; a miss is a balance
  finding for the module.
- **Foam cure pace** (the bot gate of the #157 GD ruling and TD lock, ticket 368): the lane
  `features/terrain-tools/foamCurePace.lane.test.ts` plays the pacing bot to the core of P1-P10
  and headless P40 on each pacing seed, twice, both runs with foam's every Mark researched: bare,
  and with stabiliser foam slotted at its cure Mark and pressed by the magnet hand, so each spray
  cures its cells for good. Gated on the seed median: time to core at least 0.98x the bare time.
  Run it by name; a miss is a balance finding for the cure.
- **Quench cutters** (the GD ruling on #373, ticket 373): the lane
  `features/aetheric/quenchCuttersPace.lane.test.ts` plays the bot from on-curve arrival to the
  core of planets 41 and 60 on the three pacing seeds through the quench hand
  (`aetheric/quenchHand.ts`: side cutters kept engaged, the condenser run once a second whenever a
  dry run accepts it), with and without the combo owned. Gated per planet:
  the combo strands the bot on an empty tank no more often than the run without it (gate 2), and
  the median core-time ratio stays at or above 0.98 (gate 3). Gate 1, net drill energy per cell at
  least 0.9x, is a unit assert in `quenchCutters.test.ts`: the refund per dig second stays under a
  tenth of the drill's draw at the condenser's ratio, whatever the bot's speed. Run it by name.
- **Money to planet 200** (#316 TD scope f, TD pin on #123, ticket 340): `npm run balance:money-p200`
  runs the lane `logging/moneyPastP200.lane.test.ts`. The bot plays the bot scenario on the first
  pacing seed to planet 200's core (prices near 1e104), headless, keeping no run log
  (`playSliceIntoSink`), and folds each event into `moneyLaneLines.ts` as it arrives. It writes
  `balance-report/money-p200.ndjson`: a first line with the run and its largest price, income and
  amount, then one line a planet (arrival and departure `drill_power`/`drill_tip`, felt speed as
  drill ticks per metre of bands 1 to 5, time on the planet, docked and cutting ticks, the trip
  share in basis points, the largest Money and its significant digits). It fails on any logged
  event the schema refuses (every money field canonical text, #5), on a run that does not finish
  and on a log over 1 MB, apart from the first-hour gate. A `*.lane.test.ts` file runs only
  when a CLI filter names it (`vite.config.ts`): it takes hours, so neither `npm test` nor the
  nightly picks it up. Its rounding rule is unit-tested in `systems/money.test.ts` (charges never
  round down, income never up, at 1e36, 1e37 and 1e40).
- **Combos pace** (pin 6 of the GD lock on #206, ticket 206): `features/combos/comboPace.test.ts`
  plays the bot from on-curve arrival to the core of planets 7 and 10 on the three pacing seeds
  bare, with the shipped combos' parents owned and the drain, ore-shifter and corer pressed by
  `withComboHand` (the kernel bot presses no slot, so the hand wraps its waits as the magnet hand
  does), and with every shipped combo owned too. Gated on the median of the per-seed ratios: all on
  at least 0.98x the core time without the combos, and the combos with their parents at most +15%
  income per minute over bare. The alarm shield's runs (on its own vs pressed by hand on every lunge
  warning, at least 0.98x, and the auto run replaying to the same digest) skip until a tech node
  researches the steam sear (#318), whose toggle is the one auto switch. Long: for the box Tester.
- **Twists pace** (pin 6 of the GD lock on #206, ticket 329): `features/artefact/twistPace.test.ts`
  plays the bot from on-curve arrival to the core of planets 7 and 10 on the three pacing seeds
  bare, with the three twists' base items owned (echo sounder, grapple winch, ore-shifter, the
  third cradle opening their third slot) and pressed by `withTwistHand`, and once per twist with
  that twist held too, the twist being the run's one artefact. Gated on the median of the per-seed
  ratios: the bot's best card (its fastest twisted run) at least 0.98x the base run's core time,
  and each twist with its base item at most +15% income per minute over bare.
  `features/artefact/twistNoFreeCell.test.ts` runs #281's exact check once per twist (the twist
  held, its base item owned, no slot pressed). Long: for the box Tester.
- **No free cell from item hooks** (GD lock on #206, Vertical pin 1, ticket 323):
  `bot/noFreeCellRuns.ts` is #281's exact check as a harness: the bot arrives on planets 7 and 10
  on-curve and plays to the core on each pacing seed with a bare setup and with items owned, none
  slotted and no slot pressed, and the cells dug, their ticks, the ore value and the core tick must
  match exactly. `bot/itemHookNoFreeCell.test.ts` runs it with every registered `combo.*` item
  owned and skips while none is registered; the lane consults and the combo and twist builds call
  `noFreeCellRunsOn` with their own setups (both lists the same length, so the `seq`s line up).
- **Bot combat** (#130): the bot meets a hunting enemy with the drill head between bores (#29), and
  on the move too once its vehicle was destroyed on that planet; travel resets that. A run with no
  death plays as before, and a fatal dive no longer replays after every tow (`bot/botCombat.test.ts`,
  in the band-1 corridor).
- **Bot attrition** (#198): from planet 8 on, a track step must leave #180's service reserve plus
  one rescue fee (`bot/botWallet.test.ts`), and the second death on one route (a goal: an ore band or
  the core) closes it and every deeper one until the vehicle has a level it did not die with; the
  bot mines the bands above meanwhile (`bot/botDeathReplay.test.ts`). Planets 1 to 7 play as before.
- **Bot retreat** (#216): when no band the casing holds pays a trip, the bot widens the shallowest
  held band whose galleries ended at their reach by another reach; broke with a tank below what a
  tow leaves (#8), it strands itself off the pad for the tow. A run that never meets the dead end
  plays as before. `bot/botRetreat.test.ts` bores band 1 out at grade 1, wrecks the vehicle and
  empties the wallet, then plays on from there with `playSliceFrom`.
- **Comparison** (`compareRuns`): `npm run balance:report` prints each seed's row and the median,
  writes the first seed's run to `balance-report/` and compares it with
  `tests/balance/bot-slice.summary.json`; differences are numbers, never failures. After a
  deliberate economy change, `npm run balance:baseline` rewrites the baseline in the same commit.
- **Sawtooth** (#81, C3 #86): the summary's `sawtoothBandDigTicks` holds each planet's band-5
  drill ticks per metre with the levels it was entered and left with (`bandDigTicks` in
  `systems/vehicle/bandDig.ts`), and `firstBandDigTicks` the same for band 1; `compareRuns` shows
  both per planet. `balance:planets` plays the bot scenario on each pacing seed and warns where the
  median band-5 departure is over 0.7x arrival on a planet the bot left (`sawtoothMedian.ts`);
  each seed's cell shows its drill_power and drill_tip leads past the curve on arrival and at
  departure (`planetLeads.ts`). The bot holds drill_power to one level past the planet's on-curve
  level (five on planet 1, json `onCurve.botLeadOnPlanet1`, ticket 396) and its forced core rule
  then buys drill_tip to two past (`bot/botCoreRule.ts`, #86), so a lead above those bounds is a
  bot bug, not a balance finding. Band 1 already digs at the
  24-tick cap on arrival, so it is printed, never judged. Reported in `balance:planets`; gated on
  planets 1 to 7 by R1 below.
- **Campaign scaling gate** (R1, #89): `src/logging/campaignPacingGate.test.ts` (nightly only) plays
  the bot scenario on each pacing seed to planet 8's core (`campaignGateLastPlanet`) and fails, via
  `campaignScalingGate.ts`, on a median band-5 departure over 0.7x arrival on a planet left, a
  seed still short of planet 8's core inside the slice budget plus 120 minutes a later planet, or a
  locked schedule with more than 2 campaign planets in a row without a horizontal row (#81).
  Campaign pacing (45 to 60 minutes a planet, C4) is printed with its dial, never gated: a miss is
  a Systems & Economy finding, and `k_casing` stays at its floor (Game Director on #84).
  `src/logging/campaignScalingGate.test.ts` breaks each check in a test double, pins the Horizontal
  Scaler's `source_hash`, and holds the M1-M5 module rows back at `vision` to show the gate needs
  none of them. The C1-C4 and H1-H2 probe files are listed with it in the manifest's cross-slice
  checks.

- **Move-PR guard** (#230, Vertical direction of the #191 lock): tests move into
  `src/features/<slice>/` with their slice's migration, and `npm run tests:move-guard` (against
  `origin/main`, or `-- --base <ref>`) checks that such a move changed nothing it should not. It
  checks the base out detached in a temporary worktree, lists both trees with `vitest list`, and fails
  when the count drops (or falls under 2,163, main at #191), when a test ID (the describe/it names,
  file left out) is gone or renamed, or when a golden, a scenario or `pacingSeeds.ts`, the balance
  baseline or one of the Vertical Scaler's tables (`docs/scaling/vertical/source_hash.mjs`) changed,
  appeared or went missing. Goldens and scenarios are matched by file name, so they may move; the
  tables and `pacingSeeds.ts` by path. `-- --balance report` (repeatable, any `balance:<name>`) also
  runs the report in both trees and requires byte-identical output; that is the box Tester's run.
  The rules are pure in `scripts/tests/movePrGuard.mjs`.

## 5. Browser and packaged end-to-end (Playwright)

- Specs drive the game only through `window.steampunkDebug`, `window.steampunkRunLog()` and the
  launch parameters (`?debug&scenario=<committed file>` in a browser, `--debug-api` and
  `--scenario=<path>` for the packaged build). Assert state and digests, never pixels; no
  screenshot comparisons in the slice. Every browser spec also asserts no console error.
- `e2e/browser/` runs on the preview build (`npm run test:e2e`, which builds first unless `dist/` is
  newer than every build input, as right after `npm run build`; install the browser once with
  `npx playwright install chromium`; `E2E_PORT` moves the preview off the shared 4173). `e2e/packaged/` runs on the packaged game
  (`npm run electron:build`, then `npm run test:packaged`, under `xvfb-run -a` on Linux); each
  launch gets a fresh user-data folder.
- Not covered, by design: vehicle feel, camera, art and audio. Those stay hand checks.
- **Affected specs** (#190): `npm run test:e2e:affected` runs only the browser specs a change can
  affect (against `origin/main`, `-- --base <ref>`, or the listing in `CHANGED_FILES`; `-- --dry-run`
  prints the choice). The map is `e2e/affected.json`: a changed spec runs itself, config, package,
  e2e helper and map changes run the full suite, docs and unit tests run none, and a path no rule
  maps runs the full suite. A new spec joins a rule (`scripts/e2e/affectedSpecs.test.mjs` fails until
  it does). The nightly full run catches what the map misses. With `CI=1` a failed test gets one
  retry and counts as flaky; `npm run test:e2e:timings` prints the run's phase and per-spec times
  from `e2e-report/results.json`.
- **Screen matrix** (#173, #179): `e2e/browser/screens/` runs once per reference screen, one
  Playwright project per cell of `screenCells.ts` (desktop, ultra-wide, 32:9, TV and TV at 1080p
  with TV mode on, iPhone 13 and Pixel 7 class phones in landscape, a phone in portrait, a tablet).
  The cell's expectations are the decision's own tables (zoom cap, render-scale floor, stage), not
  the game's formulas. It asserts the zoom cap and pillarbox (`ui.getCameraView()`'s
  `maxViewShortAxisMetres`, the `game-stage` box), the render-scale floor and a pin at it
  (`ui.getRenderStats()`'s `renderScaleFloor`), the #38 budgets at the widest zoom, every HUD and
  bay-screen text at least its 1280 x 800 size times the UI scale, TV mode's 2.22%/2.78% text,
  5.9% controls and 5% safe area, 44 px targets (56 on touch), a focus ring on each control Tab
  reaches, no art upscaled at the 12 m default, a lined casing cell reading at the widest zoom and
  the render-scale floor (`ui.getDrawnLiningAt`, ticket 315: about 24 px a cell on a phone), the
  portrait card, and the touch controls: their
  sizes and clearances, taps alone reaching every screen, the cluster following the dock, the
  left-handed mirror, and a stick run pressing the same action stream as its key run
  (`input.getActionStream()`, real touches through CDP). Each cell also writes the #173 look set;
  `npm run screens:update` puts it in `docs/screens/` for review, never compared
  ([docs/screens/README.md](screens/README.md)). Software WebGL at 4K is slow, so these projects
  allow 5 minutes a test and 30 s a wait.
- **Drill-down run** (ticket 416): `e2e/browser/drillDown.spec.ts` holds the real Down key for 10 s
  on the P1 surface from `scenarios/drill-down-start.scenario.json`, at stored drill_power steps 1
  (the save's), 5, 10, 15 and 20 (`debug.setUpgrade`, ticket 434), and writes one row per run (start and end position, depth gained, cells/s,
  m/s, level, seed, build commit, time) that the Tester appends to `drill-down.ndjson` on
  `test-metrics` for the Tests tab and the Drill speed panel ([loop-status.md](loop-status.md#drill-down-run-ticket-416)). It
  watches and does not judge: it asserts only that the vehicle went down and did not stall at 0.
  The speed ladder assertion is #409's. Box Tester slow tier and nightly only.
- **Memory soak** (#99): `npm run soak:memory` builds, starts `vite preview` and drives the vehicle
  for 10 minutes through chunk cycles (dock, undock, right 8 s, down 8 s, left 4 s, right 4 s) with
  Playwright, reading the counts only through `ui.getRendererMemory()` and `getPhysicsStats()` and
  the heap through the browser after a forced GC. It writes `test-results/soak/soak.json`,
  `summary.json`, `soak-chart.svg` (heap and counts per cycle boundary against the gate) and three
  heap snapshots, and exits 1 when the gate in `scripts/soak/soakGate.mjs`
  fails: after 4 warm-up cycles, the median heap of the last 3 cycle boundaries more than 20 MB
  above the first 3, geometries, textures or colliders rising in 3 or more of the last 10 steps
  without falling, any page error, or fewer than 15 cycles. The gate and summary are pure and
  tested in `scripts/soak/`; `--evaluate <soak.json>` re-checks a saved run and `--job-summary <dir>`
  prints its summary as one Markdown row. The box Tester runs it as a regression gate (#103) every night (never on every push,
  because 15 cycles of ~36 s cannot fit a shorter profile) and records the result on the
  `test-metrics` branch (docs/metrics/test-metrics.md). To check a change for leaks before
  merging, run it by hand. On a box with no
  Playwright browser, pass `--browser /usr/bin/google-chrome` (run the script itself, after a
  build). Record a run with `npm run perf:record -- --source soak --from test-results/soak/summary.json --from test-results/soak/soak.json`.
  The same soak runs the packaged game (#102): after `npm run electron:build`,
  `xvfb-run -a node scripts/soak/soakMemory.mjs --electron release/linux-unpacked/steampunk-miner`
  launches it with `--debug-api` and records under `soakElectron.*`. Its numbers back the decision
  to set no heap or stack flags ([docs/perf/runtime-flags.md](perf/runtime-flags.md)).
- **Memory and frame samples in the run log** (#121): dev, scenario and debug runs log `perf_sample`
  every second of frames (now with `frameMsP99` and `longTasks`, the frames over 50 ms) and
  `memory_sample` every 10 s of frames: the JS heap, Rapier's WASM memory, the renderer and physics
  counts (the same seams as the two debug reads), cached and meshed chunks, DOM elements and live
  listeners, beside the progress so far (`maxDepthTiles`, `tilesDestroyed`, `mineralsCollected`,
  `moneyTotal` earned). Read them from `events.ndjson`, or `window.steampunkRunLog()` in a browser.
  Chromium rounds and caches `performance.memory` unless it is launched with
  `--enable-precise-memory-info` (the soak passes it): without the flag the heap fields stay flat for
  minutes. A browser without `performance.memory` writes no `memory_sample`. `e2e/browser/memorySample.spec.ts`
  checks the lines of a real `?debug` session against the schema.
- **Snapshots** (#123, debug runs only: dev, `?debug`, `--debug-api`; a plain `?scenario=` run keeps
  none): every slot save is copied to `snapshots/save-<tick>.json` and `checkpoint_saved` names it in
  `file`; a save every 5 minutes of frames and at page hide, a heap snapshot each time the heap
  climbs another 50 MB above the first `memory_sample`, and a screenshot of the canvas on a planet
  change and on the first second of a frame budget breach each log one `snapshot_written`
  (`kind`, `trigger`, `file`, `bytes`). Electron writes them under `logs/<runId>/` and takes the
  `.heapsnapshot` in the main process; a browser keeps the newest three runs in IndexedDB and its
  heap step logs a line with no file (a CDP harness takes its own). The triggers are pure
  (`src/systems/snapshots/`), the writer is tested with memory fakes (`store/runSnapshots.test.ts`)
  and `e2e/browser/snapshots.spec.ts` checks a planet change, a dock and the zip on the preview build.

## 6. Before every commit

`npm run typecheck`, the touched Vitest files green (and `npm run lint` for boundary rules), and
`npm run tests:manifest` when tests were added, moved or deleted (section 1, the test manifest).

**Long runs belong to the box Tester, not to build workers (Bjor, 2026-10-07).** A loop build worker
runs only typecheck, lint, format:check, build and quick targeted Vitest files (`npx vitest run <files>` or
`npx vitest related --run <changed files>`). It does not run pacing bot comparisons, full `balance:*`
reports, Playwright/e2e or packaged specs, screenshot or clip capture, benches, soak or multi-seed
sweeps. It still writes and registers the e2e, pacing and balance tests its ticket needs. Acceptance
that needs pacing, balance or e2e numbers is judged by the box Tester when the spec's tickets are all
closed (and nightly, ~01:30 Oslo); red reopens the ticket with `needs-fix`. The worker's resolution
comment ends with one line listing those commands in backticks, which the Tester runs as its `probes`
job:

```text
Tester checks: `npm run balance:charges`, `npx playwright test e2e/workshop.spec.ts`
```

Allowed shapes: `npm run balance:<report|planets|guns|charges|refinery|heat>`, `npm run bench:<name>`,
`npx playwright test [files]`, `npx vitest run <files>`; write `Tester checks: none` when nothing applies. By hand for
anything visual: `npm run dev`, then say what you checked in the commit message.
