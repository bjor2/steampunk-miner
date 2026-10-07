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

- Applying a scenario submits `debug.*` authority commands (so it replays from `commands.ndjson` and logs
  `debug_command_applied`), then runs its script (`fastForward` steps).
- Browser: `?scenario=<json>` at launch (parsed by `parseScenario`); `?debug` (or the dev build) exposes
  `window.steampunkDebug` (the `DebugApi`), `window.steampunkRunLog()` and `window.steampunkRunCommands()`
  (the newest NDJSON lines, up to a million characters per file, browser shell only, #117).
- Every wired debug method answers `{ ok: true, ... }` or `{ ok: false, problems }`: `setPlanet`,
  `setPlanetSeed`, `teleportToDepthTiles`, `teleportToDepth(depthBp)` (basis points of the radius),
  `teleportToDock(bay?)` (the `debug.teleportToDock {bay}` command: docked at rest in the Sell bay, or the Upgrade bay when named, no tow, no fee),
  `giveMoney` (a decimal string such as `"1e30"`), `applyScenario`,
  `fastForward(ticks, commands?)`, `snapshot()`, `restore(snapshot)`, and for the vehicle
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
  under `logs/<runId>/`). Collapse specs build a weak band-2 tunnel or dig one with `collapse/collapseFixtures.ts`. Specs that mine deep (where crawlers live) freeze enemies first
  (`FREEZE_ENEMIES` in `scriptedSession.ts`); combat specs fight in the band-1 corridor of
  `combat/combatFixtures.ts`, where no spawn point is in reach. The `ui` namespace (`ui.setCameraMode('rotating' | 'fixed')`, `ui.setPref(name, value)`,
  `ui.getPrefs()`, `ui.getHudModel()`, `ui.getSellBayModel()`, `ui.getUpgradeBayModel()`, `ui.getRefineryBayModel()` (#105), `ui.getBayPresentation()`, `ui.getAudioModel()`, `ui.getScreenLayout()` (#173: the stage, `--ui-scale`, the TV safe inset, the smallest control and the bay-screen text size)) reads the
  screens' view models, the bay screen's shutter, text size and preview framing (#45, #44), the music's layer targets, settings and stinger sequence (#49) and
  the drill voice (`drillVoice`: `casing` while the drill's nose is in lining, #41), and
  changes local presentation only: no command, no log line, no `debugApplied` (#11 amendment 2,
  #33). The `input` namespace (`input.press/release/tap(actionId)`, `input.getBindings()`,
  `input.setBindings(overrides)`, and the unlogged read `input.getActionStream()`: every action
  pressed and held one released, oldest first, from keys, touches and the API alike, #173) presses
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
  The second slice's runs (S11, #65) live in `src/systems/replay/secondSliceGoldenScripts.ts`:
  casing (a grade-2 bore in band 2, then `debug.forceCollapse`), collapse (a grade-1 dig into band
  2), the two bays (`wrong_bay` both ways) and the artefact cache (live on planet 1, a husk on
  planet 2). `src/logging/secondSliceGolden.test.ts` replays each committed file and checks it still
  shows what it is named for, and that the husk's chunk digest equals a player's who holds nothing.
- **Pacing bot** (`src/systems/bot/`, #29): plays `scenarios/bot-slice.scenario.json` through
  authority commands with the #6 movement-time model, buying casing grades on-curve (grade `b`
  before it mines band `b`, grade 5 before the core, S11). Its scripted mining (`drillTile`) lays
  casing through the player's placement code, one ring per metre, and the lining bill is settled per
  Sell bay visit (#115, #128); the pacing specs fail a drill dive with no `casing_placed` and a slice that
  forgives more than a tenth of the lining it charged. `src/logging/pacingGate.test.ts` fails on a
  missed pacing target (`src/constants/pacingTargets.ts`), an unregistered event or field, a broken
  #2 sequence or more than 4 MB of core events and commands in the first hour.
  `src/logging/assayPacingGate.test.ts` holds the bot holding `assay_beacon`
  (`bot-slice-assay.scenario.json`) to the same three gates: the #16 first ten minutes, the planet 1
  core in 30 to 60 minutes and the slice in 90 to 130 (`pacingVerdicts` prints pass or fail for each). Trips per planet
  outside 3 to 12 are printed, never failed. Both play their scenario on three world seeds
  (`src/constants/pacingSeeds.ts`, the scenario's own `worldSeed` first) and gate on the median of
  each metric (`medianPacingReport`, #84), so one run's combat deaths cannot flip a gate; the log
  checks, the baseline and `compareRuns` stay on the first seed. Do not retune the bot or a constant to make it pass: a
  miss is a balance finding for the Systems & Economy Designer (the lever is `paceScale`).
- **Guns** (#107 acceptance 5): `npm run balance:guns` plays the bot to planet 7's core with
  `auto_guns` (mounted on planet 4) and without, and prints planets 4 to 7 side by side with each
  planet's gun energy and kills from the dive summaries (`deriveDiveSummaries`). Reported, never gated;
  a planet that moves by more than 10% is a balance finding whose one lever is
  `gun.damageFractionOfDrill`. Gun combat specs fight in the band-1 corridor with `debug.setGunLevel`
  and the planet 4 on-curve levels (`combat/gunFire.test.ts`).
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
  share cap beside it for information; #148 gates the bot's `gate_cleared` medians), then plays
  the bot scenario to planet 40's core on each pacing seed blasting (the bot's default) and never,
  and prints both median core times per planet, the blasts and whether each is inside C4: planets 7
  to 10 judged, 13 to 34 and 40 diagnostic until #148. Last, the dynamite gate (GD lock on #148,
  ticket 236): the shells each seed's blasting bot freed (`mining-gates.gate_cleared {gateKind:
dynamite}`) on planets 7, 10, 16, 22, 28, 34 and 40, and their median, expected at 1.5 or more a
  run. Reported, never gated; the one lever is the price per charge. The band-density guard is also a spec (`bot/chargeSizeTrade.test.ts`). Charge
  specs stand in band-2 rock with `charges/chargeFixtures.ts`, and the size specs in solid rock of
  the planet their size opens on (`sizedBlasterOn`); the bot's blasting run starts on planet 7 with
  a stocked rack and a lagging drill (`bot/botBlasting.test.ts`). The bot buys charges only on a
  planet where it met a tile it would blast with none in stock (#129, `bot/botChargeNeed.test.ts`:
  an on-curve run plays exactly like `chargePolicy: 'never'`); the stuck rule buys size 1 and the
  bot plants only fused sizes. From the mining gates (#236, `bot/botGates.ts`) the bot reads the
  drill's gate verdict before it bores: a refused or blocked cell is a wall, and a dynamite-gated
  shell is blasted with the smallest carried fused size that frees it, else its size is what the
  next restock buys (`mining-gates/systems/botGates.test.ts`, on planet 7's generated shells). Gate
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
  level and its forced core rule then buys drill_tip to two past (`bot/botCoreRule.ts`, #86), so a
  lead above those bounds is a bot bug, not a balance finding. Band 1 already digs at the
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
  reaches, no art upscaled at the 12 m default, the portrait card, and the touch controls: their
  sizes and clearances, taps alone reaching every screen, the cluster following the dock, the
  left-handed mirror, and a stick run pressing the same action stream as its key run
  (`input.getActionStream()`, real touches through CDP). Each cell also writes the #173 look set;
  `npm run screens:update` puts it in `docs/screens/` for review, never compared
  ([docs/screens/README.md](screens/README.md)). Software WebGL at 4K is slow, so these projects
  allow 5 minutes a test and 30 s a wait.
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
