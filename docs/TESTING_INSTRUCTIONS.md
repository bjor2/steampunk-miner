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
  of the slot index, autosave first, each entry with its exact playtime tick and wall time); for the
  pacing bot (ticket 656), `bot.playToPlanet(planetIndex)` (a promise: the bot plays from the
  session now, harvesting each core and buying each travel, up to 9 planets on, and its commands
  are replayed through `fastForward`, the only debug line, so `debugApplied` stays false; it
  answers `{ planetIndex, tick, commands, isReplayExact }`, or refuses with nothing changed when the
  bot does not land).
  Collapse specs build a weak band-2 tunnel or dig one with `collapse/collapseFixtures.ts`. Bore gun specs (ticket 313) stand the rig in a pocket of band-1 rock with `bore/boreFixtures.ts` and register the gun's numbers through `boreGunSlice` inside `withRegistrations`, as no slice answers `boreGun` yet. Auto mode specs (ticket 317) use `bore/boreAutoFixtures.ts` `searSlice`, which adds the steam sear's numbers and its research, and stand the rig at `AUTO_RIG`, on the east edge of its collapse block, so a level shot east never warns the rig's own block. A slice's self-acting item (ticket 328: the steam shield) is specced with the real press path through `power-up-core`'s `withPowerUpCore([itemSlice, fixture])`, the fixture registering the item's research and a stand-in `autoFire` hook for the combo, in the corridor fight of `combat/combatFixtures.ts`. Collapse brace specs (ticket 331) register the fake `brace-probe` slice of `collapse/braceFixtures.ts` (a section, a command, a clock step and the provider) inside `withRegistrations`, so a brace can end by command, by clock step or by `untilTick`. Hazard strip specs (ticket 341) dig straight down the plain line of `render/hazardStrip/stripFixtures.ts`, fixtures placed in metres below the start, at a steady speed frame by frame; the per-frame cost is the sampler's own cost model (`spentUs`), and the wall clock is `npm run bench:strip`'s. Specs that mine deep (where crawlers live) freeze enemies first
  (`FREEZE_ENEMIES` in `scriptedSession.ts`); combat specs fight in the band-1 corridor of
  `combat/combatFixtures.ts`, where no spawn point is in reach. The `ui` namespace (`ui.setCameraMode('rotating' | 'fixed')`, `ui.setPref(name, value)`,
  `ui.getPrefs()`, `ui.getHudModel()`, `ui.getSellBayModel()`, `ui.getUpgradeBayModel()`, `ui.getRefineryBayModel()` (#105), `ui.getBayPresentation()`, `ui.getAudioModel()`, `ui.getScreenLayout()` (#173: the stage, `--ui-scale`, the TV safe inset, the smallest control and the bay-screen text size), `ui.getPauseMenuModel()` and `ui.setPauseSaveName(name)` (ticket 404: the pause menu, null while closed, and the name its next save takes; ticket 704: a saved row's `scrap` and, once armed, its `scrapConfirm` question with Scrap and Keep)) reads the
  screens' view models, the bay screen's shutter, text size and preview framing (#45, #44), the music's layer targets, settings and stinger sequence (#49) and
  the drill voice (`drillVoice`: `casing` while the drill's nose is in lining, #41), and
  changes local presentation only: no command, no log line, no `debugApplied` (#11 amendment 2,
  #33). The exception is `ui.setDevFlags(flags)` (ticket 548), which sends a logged
  `debug.setFlags` and marks the run; `ui.getDevFlags()` is its unlogged read; and
  `ui.setMaterialPopMode(mode)` (ticket 614), logged as `material_pop_mode_set`. The `input` namespace (`input.press/release/tap(actionId)`, `input.getBindings()`,
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
- Save keeping specs (#470 P1-8, ticket 479): `store/saveKeeping.test.ts` installs a memory folder whose
  `write` throws a `QuotaExceededError` while a flag is set, and a fake `SaveTransfer`
  (`installSaveTransfer`, null in `afterEach`) for Export's hand-over and Import's picked text;
  failure, export, import on "another device" (a fresh folder) and the docked page-hide write are
  asserted there. The localStorage + IndexedDB mirror is `shell/mirroredSaveFolder.test.ts`, two memory
  stores standing in for both (IndexedDB itself is only reached by the browser e2e
  `e2e/browser/saveKeeping.spec.ts`, which also exports and imports in a fresh context). A file picker
  opens only from a real tap, so specs import through `steampunkDebug.saves.importText`.
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
- **Roster byte identity** (ticket 446, TD ruling 6226236698 section 5):
  `src/features/roster/roster.byteIdentity.test.ts` holds the material roster to a look layer. A:
  generation with the `roster.materials` fold off (`withRosterOff`, `rosterFixtures.ts`) and on
  gives the same cells with the kind slot masked, the same density and the same ore counts per
  band, family and tier (whole planets 1 to 5 on the pacing seeds). B: the masked P1 and P2 cells
  and counts over the 8 named seeds equal main's digest taken at f49323ba. C: every drawn kind sits
  on its own family, rarity and window, no patch is bare, the draws split within 4 sigma, price and
  gate ignore the slot, the `mined-order-mixed` golden raises the same events either way, a reload
  draws the same roster, and the roster golden pins the rosters and the P1 and P2 draws. About a
  minute. The lane `roster.byteIdentity.lane.test.ts` runs A over all 64 seeds (about 10 minutes),
  and the lane `roster.pacing.lane.test.ts` (D) plays planet 1 to its core on each pacing seed with
  the roster, with the fold off and from an unstamped old-save planet 1, prints each run's first
  drill purchase and time to core, and fails a roster run whose first drill purchase is more than
  5% later than the fold-off one's. The guard and bounds are exact on the roster in
  `roster/systems/rosterGuard.test.ts`, on P1 to P7 over the pacing seeds (#453): it skips cells
  only the relic signature paints, counts 15 kinds drawn on an unswapped P3+ planet and 17 on a
  swapped band 3, and shows the guard short on exactly the swapped band-3 fossil commons without
  Option B's two rows. Part C also reads P3 to P5 on the pacing seeds. `roster/systems/rosterSpecies.test.ts` (ticket 447) binds
  each `materials.json` species to its kind slot by `(pool, slot)` with the slot's family, rarity
  and window, and holds one species of each pool in every slot its planets can ask for.
- **Rarity share bounds** (ticket 449, Systems on #139: 6203159815, 650 bp per tier since
  6203640346, the trip asserts of 6202970624 section 7.5): `src/features/roster/rarityShares.test.ts`
  reads P1 to P7, P10, P20, P40 and P60 on each pacing seed and fails any bound missed, in whole
  basis points: non-common kind 1500, non-common tier 650, epic and mythic 1500 of a trip, common
  kind 5000 of a band trip and 4000 of the planet, 2 live commons per band, no bare painted cell
  (the family-first guard), band mean within 0.5 bp of today, trip CV 3%, the 99.9th percentile
  trip 1.12 of the expected one and the clamp at most 1 bp of mean income. Kind bounds apply where
  a planet has a roster (P1 to P7; P8+ has no species pool and no roster); tiers and means read the base
  signature share (Systems' model), a story planet's boost is printed, not judged. A fixture breaks
  each bound. The trip ledger (`roster/systems/tripLedger.ts`, its spec beside it) prices units
  through the real #509 clamp and reads mean, CV and clamp cost exactly over the clamp's states,
  the 99.9th percentile and the worst epic and mythic trip from seeded trips. The same spec fails
  while `docs/economy/rarity-shares.json`, the status page's table, is stale: rerun
  `npm run rarity:shares`. About 15 seconds.
- **Depth density curve** (ticket 448, Systems on #139, comments 6202970624 section 7.4 and
  6203133480 section 2): `src/systems/economy/depthDensityCurve.test.ts` holds the shipped 257-entry
  table to the formula, the band means within 1% of Systems' table (band 5 at 2200 bp), the
  column's value-weighted ore within 0.5% of today's step bands and the top 2% of depth at 6% ore
  or less. `src/systems/world/orePatches.test.ts` checks a planet under the curve fires its deep
  band-1 patches more often than its shallow ones, and `generatorGolden.test.ts` pins the curve's
  P3, P8, P10 and P60 beside the unchanged rules-2 digests. `src/systems/authority/depthCurveTank.test.ts`
  asserts the #396 tank rule on the on-curve rig for P3 to P40 and P200: band 1 is the worst band
  and the rule's tank on today's step bands holds at least 1.10 times the new worst hold. The lane
  `src/systems/world/depthDensityPaint.lane.test.ts` generates pooled seed sets at radius 150, 300
  and 1000 and on planet 200 and fails a band whose painted fraction is more than 2% off the
  curve's band mean (about 3 to 5 minutes).
- **Surface layer** (ticket 625; Systems on #306 6301879176, the ramp amendment 6301918833 and
  the VS confirmation 6301930425 on #625): `src/systems/world/surfaceLayer.test.ts` holds a fresh
  planet's rock to the rule: the top 3 cells at H = 1 on P2 to P40, the ramp over
  K(p) = max(4, ceil(ln H_b1 / ln 1.5)) cells (4, 16 on P10, 66 on P40) reaching band 1's own value at
  its last cell, every deeper cell absolute, felt cut speed for the arriving on-curve rig changing at
  most 1.5x a cell from P2 to P42, P1 and every planet stamped before ore rules 5 on the shipped band
  values, ore cells at their own tier, the band-1 cap first on P43 on the ladder, the ramp never
  shortened at a registry row's radius (ticket 643, a fake 100-tile P10) and a harder surface keyed
  on its solar-system row with a planet row on top. `src/logging/surfaceLayerReport.test.ts` holds
  the `balance:report` rows (the first planet whose ramp reaches past band 1, each such planet
  amber: cut to fit with its step, or uncut with its cells past band 1);
  `generatorGolden.test.ts` checks rules 5 make the cells rules 4 did, and `oreRulesOldSaves.test.ts`
  loads a generator 11 save of P5 under rules 4 with main's column pin and its shipped surface.
  `src/systems/save/surfaceToughnessFreshSaves.test.ts` (ticket 655, map #647 bar 3) buys travel
  from a fresh P1 to P2-P5, saves and reloads, and reads every rock cell of the top 3 cells all
  round the planet at H = 1; the same planets saved by generator 11 under rules 4 keep that stamp,
  their state digest and band 1's shipped rock.
- **P2 species pool** (ticket 632, GD lock (b) on #595 6306010182; HS, VS and G&V on #576):
  `src/features/roster/roster.p2Pool.test.ts` enters a fresh P2 under ore rules 6 on its own
  `foothold-p2` species, one per legacy kind slot, loads a P2 saved under rules 5 on the legacy
  species P1 shows, and reads the same whole-planet cells on both. `kindRows.test.ts` holds the
  `poolsBeforeOreRules` table and its resolver, `rosterSpecies.test.ts` every kind of P1, a fresh P2
  and a rules-5 P2 to one species of its pool, and `materialTable.test.ts` the 12 rows to their
  slot's family, rarity and window with looks no other species wears. Income, p* and P2's time do
  not move because the cells and kind slots do not: the Tester's `balance:report` confirms them.
- **P2's own kinds** (ticket 709, GD ruling (A) on #709; HS and VS input on #709): a fresh P2,
  entered under ore rules 9 (generator 14), draws Cinnabar (metal uncommon), Aquamarine and Jet
  (crystal rare) on its own kind slots 13 to 15 in bands 4 and 5, at their tier's price.
  `src/features/roster/roster.p2OwnKinds.test.ts` reads, on five seeds (the #647 lock's 5-seed
  check), the same whole-planet cells with the kind slot masked under rules 9 as under rules 8
  (family, tier, ore id and density, so the #448 density, every band's rarity shares, band money,
  income and p* are exactly main's), the own kinds only on metal uncommon and crystal rare patches
  of bands 4 and 5, and every other kind slot as rules 8 drew it. `kindRows.test.ts` holds the own
  slots and their guards, `planetRoster.test.ts` P1 and a rules-8 P2 on the shared 12,
  `generatorGolden.test.ts` the rules-9 P2 digest and P1 and P3 on under rules 9 as rules 8, and
  `oreRulesOldSaves.test.ts` a generator 13 save of P2 under rules 8 with main's column pin. The
  sprites are ticket 710's, so `mineralSkins.planet2.test.ts` holds slots 13 to 15 unskinned.
- **Planet registry** (ticket 642, GD lock R1 on #302 6306854642 and its addendum 6306861669):
  `src/features/ores/systems/planetRows.test.ts` holds each planet's row (pool and radius on one
  row, P1 to P10), the frozen radii to R(p) = round(300 + 175 ln p) with the shared k inside 150 to
  200, P1 at today's 300, measured minutes null until ticket 644 writes them, and the loader refusing
  a shrink inside a solar system without `radiusShrinkWhy`, a stray reason, a gap, a pool after a
  pool-less planet and an unknown field. `src/features/ores/planetRadius.byteIdentity.test.ts`
  changes each planet's radius (to 300, one tile more and twice it) and holds every band's hardness,
  ore value and price, the surface rock by depth, core hardness, `paceScale` and upgrade prices
  byte-identical.
- **Planet display names** (ticket 702, spec #678): `src/features/ores/systems/planetNames.test.ts`
  holds Planet & Narrative's names on P1 to P7, a name for every planet past the rows (to 640,000),
  the 64 distinct generated names before the lap numbers, the longest name within 16 characters
  with a four-digit lap, the 16-character budget at the 24 px display size on 360x640 and 1280x800
  (`uiScaleOf`), and the loader refusing a missing, stray, shared, digit-bearing or overlong name.
  `src/systems/registries/planetNames.test.ts` checks the `planetName` seam (`Planet {n}` with no
  provider, one provider at most).
- **World generation reads the radius** (ticket 643, GD lock R2 on #302 6306854642 and its
  addendum 6306861669): `src/features/ores/planetRadius.worldgen.test.ts` generates each fresh P1
  to P10 at its registry row's radius with its core and band starts, keeps #6's ladder past the last
  row (never below it) and on a planet a save holds under ore rules 6, and holds fresh radii
  non-decreasing to P200. `planetParams.test.ts` checks the `planetRadius` seam with a fake
  registry (row radius under rules 7, the ladder past the last row, with no provider and under rules
  6 or earlier, P1 byte-identical). `generatorGolden.test.ts` pins the registry-sized P2, P8 and P10
  and holds P1, P11 and P60 under rules 7 to the cells rules 6 made; `oreRulesOldSaves.test.ts` loads
  a generator 12 save of P5 under rules 6 on its ladder radius of 580 with main's column pin.
  `enemyStats.test.ts` holds the spawn density to the planet's own radius against the reference
  planet's under the same rules. The P2 to P10 minutes, p* and the economy bars at the new radii are
  ticket 644's paired run.
- **Per-planet hazards for P2 to P5** (ticket 651, spec #647; design note `docs/planets/hazards-p2-p5.md`):
  `src/features/ores/systems/planetHazards.test.ts` holds each of planets 2 to 5 to its own hazard
  kind on its registry row and planet 1 to none, the kind table to its four effects and numbers,
  the depth window to `floor(num * R / den)` whole cells, each window below the pinned surface layer
  and inside band 1 on a fresh planet, the pad view to several pockets on average (seen within a
  minute), and the card copy to a tag, one line of at most 64 characters with no digit and no
  unlock id. The loader refuses a hazard on planet 1, a missing one on planets 2 to 5, a shared or
  unknown kind, a window that does not rise, a lattice or chance out of bounds, copy that breaks the
  card rule, an effect without its numbers or over `hazardCaps`, and stray fields. Whether a pocket
  is met on the three pacing seeds is ticket 652's worldgen spec.
- **Hazard card lines for P2 to P5** (ticket 654): `src/features/ores/systems/hazardCardSource.test.ts`
  reads the kernel's `planetCardOf` on a fresh state: each of planets 2 to 5 shows its own row's tag
  and arrival line (at most 64 characters, two lines of the 360 px card), planet 1 and planets past
  5 show no hazard line, and a magnetic planet keeps its class card alone.
  `e2e/browser/planetCard.spec.ts` (box Tester) reads each line through `steampunkDebug.ui` and
  checks the card and its texts stay inside a 360 px window.
- **Hazard pockets in the ground** (ticket 652): `src/features/ores/systems/hazardPockets.test.ts`
  reads the pockets through the kernel's `hazardPockets` seam on generated cells. On each of the
  pacing seeds 83921, 31415 and 27182, each of planets 2 to 5 holds a pocket of its own row's kind
  within 20 columns of the dock point (the GD's "seen within a minute of landing"); every pocket is
  plain ground inside the row's window, counted in radial cells; planet 1, planets past 5 and every
  P2 to P5 a save holds under ore rules 7 or earlier meet none; and a fresh P2 to P5 generates the
  cells rules 7 made, since a pocket is a read and never a repaint.
- **Per-planet looks for P2 to P5** (ticket 653, spec #647): `src/features/ores/systems/planetLooks.test.ts`
  holds each of planets 2 to 5 to its row look (rock surface and deep, horizon, sky band) and planet 1
  and planets past 5 to none, planet 1 to its archetype palette with no band, planets 1 to 5 to a
  pairwise different rock and horizon and 2 to 5 to different bands (32 channel steps apart), every
  look's rock to at most the brightest archetype host rock (the luma materials' hue slots sit above),
  and every planet's params to the same with and without the look (existing worlds keep their stamp).
  The loader refuses a look on planet 1, a missing one on planets 2 to 5, a bad colour, a rock too
  bright, a band out of bounds, two planets sharing a look and stray fields. The kernel's
  `planetLooks.test.ts` holds the seam: the shown palette takes rock and horizon from a look and keeps
  the archetype's pad, core and underground, a planet class's band wins over the look's, and a look
  recolours a chunk's rock with every ore colour unchanged (inside #151's tint caps).
  `casingLiningLook.test.ts` reads every planet's shown palette too. `e2e/browser/planetLooks.spec.ts`
  (box Tester) checks the drawn band and the pairwise looks in a 360 px window and attaches each
  planet's review shot.
- **A fresh save per planet, P1 to P5** (ticket 656, the GD's end check on spec #647):
  `e2e/browser/freshSavePlanets.spec.ts` (box Tester; several minutes a planet) opens a fresh save
  for each of planets 1 to 5, has `steampunkDebug.bot.playToPlanet(n)` take it there, and on landing
  asserts the run is still play (`ui.getHudModel().model.isDebugRun` false, so a planet whose travel
  needs a debug command fails), the pool id, the row's hazard with a pocket of it round the dock
  (`features.ores.getPlanetRow()`) and the planet card's arrival line; planet 1 keeps the legacy
  pool and shows no card. `src/systems/bot/botArrival.test.ts` holds the bot to landing a fresh
  save (world seed 1, the browser's) on planet 2 by travel, with no debug command and a script that
  replays to the same digest; `src/debug/debugBot.test.ts` holds the live replay to the bot's digest
  with `debugApplied` false; `src/features/ores/systems/hazardNearDock.test.ts` holds each of
  planets 2 to 5 on seed 1 to its own pocket kind within 20 columns of the dock.
- **R3 re-baseline under the radius rule** (ticket 644, GD lock R3 on #302 6306854642, its addendum
  6306861669, the VS guards on #305 6306854175 and the Campaign Scaling room's rows on #644): the
  lane `src/logging/radiusRebaseline.lane.test.ts` plays `bot-slice` to planet 10's core on the three
  pacing seeds at the registry radii and judges the medians (`radiusRebaselineBars.ts`): minutes 22
  to 30 on P1-P10, felt speed at least 0.9x the planet before, drill + tip majors 3.5 to 7.0, p*
  1.51 +/- 0.03 over the steps, money per minute within 5% of the #551 equilibrium step (the VS's
  closed form solved for the rate), the climb from a trip's deepest point at most 25% of the trip on
  P2-P10, the travel fee at most 15% of the wallet at core harvest and paid in full (the #648 clamp
  not binding) on every P1->P5 hop, no seed left behind after a core and every seed through P5's
  core. It prints each step's p*, the sold ore step (amber, never gated), the planet rows' measured
  minutes and the paceScale a miss retunes first, and writes `balance-report/radius-rebaseline.ndjson`
  for the paired bar (time to core within 10% of main; on P2-P10 the 22-30 min bar wins a
  conflict), which the Tester reads beside main's run. `radiusRebaseline.test.ts` holds the fold on
  real authority states and every bar on synthetic seeds. Hours of play, so it runs only when named.
  The ore bar (GD lock of option (a) on #644) is judged off generation, not play: the lane
  `src/logging/oreValueCensus.lane.test.ts` generates every fresh P1-P10 on the pacing seeds plus
  the generator golden's pinned 4000000000, counts each pool (`oreValueCensus.ts`: ore cells at
  their base sale price, solid cells per band) and gates each seed (`oreValueBars.ts`): generated
  value at least x1.15 the planet before on P2-P10, ore cells rising strictly, band 1 the lowest
  ore share and value per solid cell rising band by band. It prints each step split into the radius
  part (R_p / R_p-1)^2 and the mix and price part, and writes
  `balance-report/ore-value-census.ndjson` with R(p) and the steps. About 20 s a seed;
  `oreValue.test.ts` holds the chunk count and every bar on synthetic pools.
- **Material looks** (ticket 450, TD shape on #450 6226270701 and the Scalers' conditions):
  `src/features/roster/kindLook.test.ts` holds the roster's look provider to its rules: a fresh
  save draws every species' skin with no rarity (ticket 698), a species' rarity shows only once the
  discovery query says the player met it, every two kinds of one family differ in at least two of
  silhouette, pattern and hue, a species keeps one look on every band and planet, the rarity a
  cell draws is its tier offset over its band, each rarity draws a wider frame, a brighter tint and
  no less glow than the one below, and a planet with no roster hands the shader exactly main's
  instance arrays (render-state digests recorded at `a157e171`, `renderStateFixtures.ts`).
  `src/scene/terrainUniforms.test.ts` holds the look to at most 24 new fragment uniform vectors,
  the full fragment stage to 96 of the 224 floor and either program to 11 of the 15 varyings;
  `terrainSamplers.test.ts` keeps the full program at 15 samplers, 16 with the hero atlas, and fails
  a 17th. `src/systems/render/kindLooks.test.ts` and
  `kindLookTable.test.ts` cover the shader's catalogue and the table encoding,
  `src/scene/terrainKindLooks.test.ts` the one writer, and
  `src/features/materials/systems/render/rarityLooks.test.ts` the rarity data's guard. The browser
  spec `e2e/browser/materialLooks.spec.ts` reads the table through `ui.getKindLooks()`. The look
  itself (each species apart at phone size) is an eye check; real-GPU frame cost is #526's A/B.
  The first-contact flourish (ticket 698): `src/systems/render/speciesReveal.test.ts` reveals a
  species once, on its first touch, never across a switch flip or a planet change;
  `src/store/speciesRevealBroadcast.test.ts` holds the store to one reveal and one chime cue per
  species and none after a restored save that had met it; `src/scene/terrainRarityReveal.test.ts`
  starts the rise once on the material's clock. `e2e/browser/firstCutSkins.spec.ts` (box Tester)
  drills the first surface ore at 360x640 and 1280x800 and holds every slot's skin identical
  across the cut, only the met species' rarity arriving with one flourish. The rarity tint's
  readability at 360 px on each band's ground is an eye check on the screen matrix.
  The per-act hero atlas (ticket 451): `src/systems/render/gpuTier.test.ts` gives it the 16th unit
  only with 16 units, the full program and an ETC1S alpha target;
  `src/systems/render/heroAtlas.test.ts` the asset lookup, the 16-cell cap and the 2 MiB resident
  budget; `src/features/materials/systems/render/heroAtlases.test.ts` the rows (hero species
  only, in the #452 cell order) and each shipped KTX2 (1024 px, ETC1S sRGB, four levels);
  `src/features/roster/kindLook.test.ts` one atlas object per act; `src/scene/terrainHeroAtlas.test.ts`
  the binder (one resident, released and disposed before the next, RGBA8 refused) and the table
  drawing a hero from its cell only while bound, met or not (ticket 698). The browser spec
  `e2e/browser/heroAtlas.spec.ts` checks through `ui.getKindLooks()` that a change of act binds
  once, a planet change inside an act binds none, and no bind links a program.
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
  a cell too); it prints, without gating, the
  seed-median planet 1 drill against 3x its start band-1 speed when it first breaks a band-3 tile and
  10 band-1 cells/s on arriving at planet 2 (`planetOneDrillPace.ts`, ticket 396; superseded for
  drill_power by #551 in ticket 552, whose per-planet bars gate in `drillPace.lane.test.ts`).
  `src/logging/logCompactionBotHour.test.ts` (nightly only, ticket 420) plays the bot's first hour
  twice, its drill spans folded and with one line per cell (`drillLines: 'cells'`), and fails unless
  the domain events are identical, the logged commands expand back exactly, every unfolded line is
  byte for byte the same apart from `seq`, and the pacing report, planet 1 drill pace, dive casing,
  summary and money lane read the same off both. `src/logging/drillLogBytes.test.ts` drills a
  synthetic hour of 60 Hz `drillStep` with 5 Hz poses through the NDJSON sink at 1x, 10x and 100x
  the planet 1 band-1 speed (events plus commands within 5% of each other), and an hour of a pose
  report every tick (the recorded stored-1 drilling track, re-stamped), and holds the TD's three
  log budget lines on #514 (ticket 522): at most 8 KB/s of commands while drilling, at most 6 MB
  in a typical hour at the bot's P1-P2 duty (46% drilling, 46% travel, 8% rest) and at most 8 MB
  in an hour of continuous drilling (MB = 10^6 bytes). `src/logging/commandLogPoseRuns.test.ts`
  round-trips the recorded schema 6 tracks in `src/logging/fixtures/poseTracks/` through pose runs.
  `src/logging/assayPacingGate.test.ts` holds the bot holding `assay_beacon`
  (`bot-slice-assay.scenario.json`) to the same three gates: the #16 first ten minutes, the planet 1
  core in 15 to 30 minutes and the slice in 40 to 130 (ticket 396's windows, slice edge per #418; `pacingVerdicts` prints pass or fail for each). Trips per planet
  outside 3 to 12 are printed, never failed. Both play their scenario on three world seeds
  (`src/constants/pacingSeeds.ts`, the scenario's own `worldSeed` first) and gate on the median of
  each metric (`medianPacingReport`, #84), so one run's combat deaths cannot flip a gate; the log
  checks, the baseline and `compareRuns` stay on the first seed. Do not retune the bot or a constant to make it pass: a
  miss is a balance finding for the Systems & Economy Designer (the lever is `paceScale`).
- **Drill-speed ladder** (ticket 409): `src/logging/drillLadder.test.ts` cuts the same 50 cells
  straight down from the planet 1 surface (seed 83921, column 20) at drill_power 1, 5, 10, 15 and
  20 (purchases since ticket 552) through the authority's swept cut (`systems/authority/drillLadder.ts`:
  the per-purchase drill law with #399's exact carry, a full tank and a hold that never fills,
  enemies frozen). It prints the table (ticks, seconds, cells/s, gain on the level below beside the
  law's gain), writes it to `balance-report/drill-ladder.ndjson` (a setup line, then one line a
  level) for comparing runs across commits, and fails a step that is not faster or gains outside
  1.181 to 1.305 a purchase compounded (the #463 bar of the GD ruling on #551, point 4, in place of
  #396's 1.12 +-5% a major; `drillLadderReport.ts`, compared in Money). The cut alone sets the time.
  About 4 s, so it runs in the change-relevant tier. The table and how to read it are in
  [docs/economy/drill-ladder.md](economy/drill-ladder.md).
- **Drill power per purchase** (ticket 552, the GD ruling on #551 and Systems' acceptance list,
  section 7): `src/systems/economy/drillPowerRows.test.ts` holds the law (`D(0) = 1.5`, D(1) =
  1.5095 within 0.1%, D(10), D(20) and D(50) within 1%, every purchase 1 to 200 gaining 1.181 to
  1.305 with no dip, D(20) / D(1) in [60, 65], 50x today's stored 20), the price rows (`price(0) =
1`, `price(n) = ceil(20 x 1.48^(n - 1)) x paceScale` for n = 0 to 300 on planets 1, 3, 8 and 11,
  no major split, p/s at least 1 on every purchase), and the numbers past purchase 100 (finite
  canonical stats at 100, 1000 and 3000, whole climbing rows to 3000). `src/logging/subStepFloor.test.ts`
  holds the lifted sub-step floor (ticket 558; it carried the floor as known red under #552): on
  soft ground every purchase to 50 delivers 1.181 to 1.305 with none dead, the cut is within 1% of
  the law from 1000 cells/s, a drill cuts past 5000 cells/s, and energy a metre at purchases 10, 20
  and 30 is D(1) / D(n) within 2%. `src/systems/vehicle/drillQuantum.test.ts` holds the rig's drill
  quantum itself (60 kept while a band-1 cell costs 100 sub-steps, doubled to 100-199 past it, 11
  doublings at most) and `src/systems/world/carvePhase.test.ts` the carve's tick phase, exact past
  2^53. The pacing half is the lane `src/logging/drillPace.lane.test.ts`: the plain bot plays the
  bot scenario to planet 10's core on the three pacing seeds and `drillPaceBars.ts` judges the
  seed medians. Since ticket 559 the bot bores on the scripted sub-step clock at real cells a
  second (`src/systems/bot/boreClock.ts`, `drillTile` at protocol 95), so every bar of the #559
  done-when gates: planet minutes 22 to 30 on P2-P10, drill-only gaps at most 10 minutes,
  planet-average felt speed at least 5 cells/s and at least 0.9x the planet before, 3 to 4 drill
  purchases a planet, no dry tank, no stalled planet, drill + tip majors 3.5 to 7.0 a planet, the
  hold, boiler, engine and hull share of track spend (at most 6% from P2, 15% on P1) and at most
  50 hold, boiler and engine purchases a planet. Printed only: all-track majors 3.5 to 6.0, the
  income gain per purchase (amber under +5% twice in a row), level 20 by P4 and 50 not before P5,
  the felt speed at the core (at most 44), drill + tip amber at 7 and the spend share without the
  hull. The bot plays with ticket 553's boiler rule and hold/engine bundles; the grind bar is a
  todo. The first drill purchase of each seed is printed for the paired bar (at most 5% later
  than main), which the Tester reads beside main's run. Its per-purchase rows `{n, D, price, planet, minute,
incomePerHour}` go to `balance-report/drill-pace.ndjson`, which `pushTestMetrics.sh` appends to
  `drill-pace.ndjson` on `test-metrics` (`scripts/ci/recordDrillPace.mjs`) to compare runs line by
  line. Hours of play, so it runs only when named.
- **Cut start latency** (ticket 433, measurement only): `src/physics/cutStartLatency.lane.test.ts`
  starts a down cut from rest in the live loop with `drill.sweptCut` on (from the planet 1 surface,
  turning the head from left, and again mid-shaft), at stored drill_power 1, 10 and 20, #400's rig
  1 and #397's 15 m/s rig (rig 2 cuts at 3600 m/s since #397 and leaves no rest start mid-shaft),
  at 30 and 144 frames/s. It prints where the ticks go until the body follows the drill
  (swivel, stale facing, first cell, held, second stall: `systems/vehicle/cutStartBreakdown.ts`)
  and the stale facing for each pose report phase, and writes them to
  `balance-report/cut-start-latency.ndjson`. Since ticket 506 (`drillStep` carries the head's
  facing) every start and report phase reads 0 stale facing; press to first motion (the swivel and
  the ticks the engaged drill stood) is logged per rig and may not grow from stored 1 to 10 to 20
  to the planet-200 on-curve drill (surface start only, after resting in the pit it digs off the
  pad); and the mid-shaft start's standing ticks, over a full cell period of face positions, may
  average no more than main's before ticket 506 (the Vertical Scaler's bars). A lane (about 2.5
  min), so it runs only when named; it fails when a start opens no cell, the two frame rates
  differ, a stale facing reads above 0 or one of those bars fails. Its rig and script are
  `src/physics/cutStartFixtures.ts`.
- **Drill step facing** (ticket 506, #433 fix 1): `drillStep` carries the head's settled facing,
  which replaces the last report's in the authority's pose, its cut gate and the motor's cut-follow
  read. `src/systems/authority/drillStep.test.ts` refuses a facing outside 0 to 3 (`invalid_pose`)
  or none, and cuts along the step's facing, not the report's; `cutFollowRead.test.ts` reads the
  slab along it. `src/systems/authority/drillStepFacing.test.ts` (the Horizontal Scaler) wants a
  fixed flag-on route's event stream (ore firsts, DrillGated, in walk order) the same whether the
  last report faced the step's way, as on main, or not, and a gated cell never cut under a fresh
  facing (about 1 s). `src/physics/drillFacingStep.test.ts` plays turns in the live loop: a drive
  turned into a cut reads no stale facing at any of the 12 report phases at stored 1, 10 and 21 (20's
  drive off the pad lands too late on some phases since ticket 558; see the spec) and 30 and 144
  frames/s, a cut turned into another direction never holds a gate that was free to
  open (the #333 hold after the old cut's gate closes mid-swivel is the gate's own rule), and the
  motor gate equals the authority's on every tick of the turn (about 1 min).
- **Drill start and turn latency** (ticket 504, measurement only):
  `src/physics/drillTurnLatency.lane.test.ts` drives #433's rig and script at stored drill_power
  1, 10 and 20 and 30 and 144 frames/s: rig 1 (#400)'s mid-shaft start with the press moved over
  the 12 pose report phases (and the report the cut gate waited for), the starts from rest, a
  drive turned into a cut and a cut turned into the shaft wall on each report phase. It prints each
  start's breakdown and each set's min / mean / max in ticks, seconds and pixels of lost travel at
  the 12 m view (90 px/m at 1080p, 70 at 390x844), and writes them to
  `balance-report/drill-turn-latency.ndjson`; the latency targets are `it.todo`s with an open
  owner, except a drive turn's stale facing, held at 0 on every report phase since ticket 506. A
  turn into the shaft wall holds its press 3 s (its first cell on the line ahead can come after
  2 s while the body already follows the cut). A lane (about 2.5 min), so it runs only when named;
  it fails when a start opens no cell, the frame rates differ on a start from rest or on a drive
  turn's report phase, or a drive turn reads a stale facing.
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
  so it runs only when named; it fails when a rig has no steady cut tick or the two frame rates
  differ, and since ticket 459 (the halo synced to the tick's post-cut world) when any steady tick
  dips, any moves slower than commanded (at the table's two decimals) or a rig holds the cut gate
  shut more ticks than `GATE_SHUT_TICKS_MAX` records (it may only shrink, #492). It prints each
  rig's down-leg distance and gate-shut ticks.
- **Post-cut halo** (ticket 459): `src/physics/postCutHalo.test.ts` cuts a level bore along planet
  1's arc with the real controller and halo, carving each tick past the face by the commanded step
  the way a `drillStep` would, then handing the controller that world (`syncGround`) before the
  substeps: at 25, 44 and 78 m/s every held step drives into ground the tick's cut opened, moves its
  full step (±1 mm) and never ends inside ground (about 2 s). `vehicleLoop.test.ts` checks the live
  loop hands the substeps the world its own drill step and report left with `drill.sweptCut` on, and
  no other world with it off.
- **Level release trace** (ticket 458, measurement only): `src/physics/levelReleaseTrace.lane.test.ts`
  plays `cutFollowRelease.test.ts`'s level release sweep (40 phases) for the 15 m/s rig and the
  rig-heavy one at 30 and 144 frames/s, and traces the 8 pressed ticks before letting go and the 12
  after: commanded speed, the speed the motor set, the body's speed, gate, reach, carry, the deepest
  contact at the body's lower front and the gap from its front to collider-solid ground just above
  the wheel line (the face's toe). It names each followed release stopped, bounced off the toe or a
  ramp that ran out, prints the table with the stop line on main's followed phases
  (`MAIN_FOLLOWED_LEVEL`), and writes `balance-report/level-release-trace.ndjson`. A lane (about
  3 min), so it runs only when named; it fails only when a sweep follows no release or the two frame
  rates trace a phase differently.
- **Fast-leg contact trace** (ticket 464, measurement only):
  `src/physics/fastLegContactTrace.lane.test.ts` plays `cutSmoothness.test.ts`'s script for the
  25 m/s rig's up leg and the 44 m/s rig's down leg (the two lines #459 leaves on `it.todo`) at 30
  and 144 frames/s, and traces every tick: commanded speed, the speed the motor set, the body's
  speed, the standing samples in the commanded step before and after the cut, carry, the cut's
  cursor and reported pose past the body, and per world substep the speed left and each solver
  contact (gap, place, normal along the facing, the ground behind it). It prints the todo's lines
  (backwards, under 80%, 5% off, largest boundary change), names each tick under 80% (standing
  ground ahead, speculative contact, overlap, no contact) with the world's prediction distance, and
  writes `balance-report/fast-leg-contact-trace.ndjson`. A lane (about 20 s), so it runs only when
  named; it fails only when a leg has no ramped-up cut tick or the two frame rates trace it
  differently.
- **Stored-rig level release trace** (ticket 465, measurement only):
  `src/physics/storedLevelReleaseTrace.lane.test.ts` plays the same level release sweep for the
  stored 10 and stored 20 rigs at 30 and 144 frames/s and traces the 8 pressed ticks before letting go
  and the 12 after: commanded speed, the motor's speed along the facing and along up, the body's
  speed along both, gate, carry, and the deepest contact anywhere on the body (depth, the push it
  gives the body in the body's frame, where on the body, and the wall: floor, face, corner). It names
  each followed release stopped, backed off or ran on, counts the window ticks the motor held at 0
  that still slid back past the stop line and how many of them the floor's tilt explains (a
  frictionless contact keeps the tick's gravity along the floor's tangent), prints the table and
  writes `balance-report/stored-level-release-trace.ndjson`. A lane (about 2 min), so it runs only
  when named; it fails only when a sweep follows no release or the two frame rates trace a phase
  differently.
- **Level-cut dips** (ticket 505, measurement only): `src/physics/levelCutDips.lane.test.ts` plays
  `cutSmoothness.test.ts`'s script with a level leg of at least 100 m for the 15 m/s rig, rig-heavy
  and the 25 and 44 m/s rigs (the two level lines that spec holds on `it.todo`) at 30 and 144
  frames/s, the down leg held 0 to 3 ticks longer so the level cut starts at another cell phase. On
  the ramped-up cut ticks it counts each run of ticks under 80% of the cut speed: depth (lowest
  share), ticks, the largest change across a held boundary, dips per metre (over the leg and over
  the judged ticks), mm and px lost at 12 m (90 and 70 px/m), and whether a dip tick crossed a
  boundary, left the ground or went backwards. It prints the table and writes
  `balance-report/level-cut-dips.ndjson`. A lane (about 70 s), so it runs only when named; it fails
  only when a run drills under 100 m or judges no ramped-up tick.
- **Drill-speed ladder in stored steps** (ticket 434): `src/logging/drillLadderSteps.test.ts` cuts
  the same column's first 20 cells (all band 1, the ground a 10 s hold reaches) at stored drill_power
  steps 1, 5, 10, 15 and 20, the levels of the browser drill-down run, one purchase each since
  ticket 552. It checks the whole column was cut and no step cut slower, stored 20 against stored 1
  within [55, 70], and the stored-20 cut on band 1 between -2.7% and +0.5% of D(20) (VS's bench bar
  (ii) split by the TD on #551): it prints the band-1 hardness and tip it used and the expected
  reading, `20 x 60 / ceil(20 n / Q)` cells/s with `n` a cell's sub-steps in the rig's drill quantum
  `Q` (ticket 558), and the cut must read exactly that. Its
  rows go to `balance-report/drill-ladder-steps.ndjson`, which the Tester's
  `pushTestMetrics.sh` appends to `drill-ladder.ndjson` on `test-metrics` for the status page's
  Drill speed panel ([loop-status.md](loop-status.md#drill-speed-panel-ticket-434)). About 2 s.
- **Cut-follow at the starting drill** (ticket 430): `src/physics/cutFollowStartingRigs.test.ts`
  plays 8 s legs down, level and up in the live loop with `drill.sweptCut` on, at stored
  drill_power 1 and 2 (tip 0; purchases since ticket 552, 1.50 and 1.86 m/s, the old stored 1 and 20) and #400's two rigs, and holds a down cut to the drill's speed
  (95% of the ticks within 5%, none under 80% or backward) past its start from rest (#433's first
  cell, held and second stall), up and level to main's shares (79%, 42%), the motor gate to the
  authority's and 30 and 144 frames/s to one path (about 40 s). Since ticket 432 an up cut holds
  every tick past its start within 5%, none backward, at 30 and 144 frames/s, up to the last tick
  the authority's gate stood open (the body then breaks out of the ground and travels). The commanded speed is the open
  gate's `vCut`, carried through a shut gate and a cleared slab. `src/physics/cutFollowRelease.test.ts`
  lets go of a followed cut at every tick of a cell's cycle (a fresh rig a phase) and wants the body
  stopped within 6 ticks (about 5 minutes); stored 2's level sweep is a todo on #465 since ticket
  459 (the toe's gravity slide after letting go). Both share the rig of `src/physics/cutFollowFixtures.ts`.
  Since ticket 491 it also holds the let-go stop at the face's toe (`src/systems/vehicle/drillToe.ts`,
  unit spec beside it): the 15 m/s rig's paired back-off ratchets at 30 and 144 frames/s and an
  airborne rig-heavy release that keeps its ramp (skipped since ticket 552 until their phases are
  re-paired at purchase 12, as no purchase cuts the 14.47 m/s they were read at), and one-step checks through `cutTickFor` (swept cut off
  reads no toe; a gated cell still stops the body) on the ground of `src/physics/toeStopFixtures.ts`.
- **Riding the cut face** (ticket 570): `src/physics/cutFaceRide.test.ts` plays down legs at drill
  purchases 1, 10 and 20 (1.5, 10.7 and 94 m/s on planet 1) on a column and a tilted column at 30
  and 144 frames/s, and a level leg turned out of a down bore, in the live loop with
  `drill.sweptCut` on, reading the world after every fixed tick (`Rig.hold`'s `observe`, the
  reads in `src/physics/cutFaceRead.ts`). On every open-gate tick after a 6-tick settle, faces in
  a generated cave left out: the gap from the body's face to the ground ahead is at most 0.10 m,
  no density sample drops by 128 or more outside the stretch the cut's front crossed in the tick,
  the body stands on ground, and no tick moves it further than the cut speed, a tick's fall and
  0.25 m (about 15 s). Since ticket 570 the swept fixtures that script a body's pose hold it at
  the cut's face (`authority/faceHoldFixtures.ts`), as a live body cannot move into ground its
  cut has not opened. `src/scene/chunkHaloEdits.test.ts` checks a built chunk mesh shows an edit in
  its density halo the frame the world changes, ahead of its capped rebuild.
- **Body-wide bore at any cells a tick** (ticket 439): `src/systems/authority/sweptFreshCarve.test.ts`
  cuts planet 1's column and its tilted radius with rigs named by their band-1 cut speed (25 to
  3600 m/s, the drill found by `subStepsPerTile` in `sweptRigFixtures.ts`), a tick count to the
  core. No 125 mm station of a faster rig's cut may be narrower than the 25 m/s rig's narrowest once
  the reach is a stamp radius past it, and the ground a tick's cut leaves must let the body's 0.9 m
  face on at least 80% of its next step (off the start lip, every tick down the column and the
  tilted radius since ticket 421 releases the carry's cell). The span must equal the per-cell
  walk from the fresh tick, refused rim and centre cells are reported once, no faster rig opens fewer
  cells or less work a metre than the 44 m/s one, and at most 1.20x the cells and 1.30x the work: a
  regression ratchet that #441's band replaces. `src/physics/sweptFreshCarveLoop.test.ts` plays
  stored rigs 370/600, 450/600 and 2000/600 off the pad and down at 30 and 144 frames/s: never more
  than 6 straight cutting ticks at 0 m/s, at least 50 m down, one path for both rates (about 20 s).
- **Swept cut through planet 1's centre** (ticket 539): `src/physics/sweptCoreCrossing.lane.test.ts`
  plays the stored-200 rig (the planet-200 on-curve drill, 3600 m/s through band 1) off the pad and
  holds it down for 300 ticks at 30 and 144 frames/s with `drill.sweptCut` on, lined at casing
  grade 5 so a cave-in never crushes it. No tick may move the body further than its step bound for
  the gate it moved under, no tick of the held cut may carry it more than one density sample away
  from the centre (before ticket 539 it crossed the centre and jumped 60 m out and back every tick), it must
  reach the centre and stay there, and both rates play the same ticks. Each run prints its largest
  move with the body and cut cursor before and after it. A lane (about 5 s), so it runs only when
  named. The motion rule's stop is unit-tested in `src/systems/vehicle/cutFollowMotion.test.ts`.
- **Swept ledger charges the work it spends** (ticket 466, dark until #441's ring re-run):
  `src/systems/authority/clampedCharge.test.ts` checks fix A's driver with fakes (one carve when
  the release clamp keeps the carry, a second charging exactly the clamped carry when it lowers it,
  the stored carry the first clamp's). `src/systems/authority/sweptChargeConservation.test.ts` cuts
  the 100 m column and tilted legs of `sweptRigFixtures.ts` at 5 to 3600 m/s through a recorder on
  the swept carve's walks (`sweptChargeFixtures.ts`; the ledger is not in the loop yet) and wants
  the ledgers to charge the paid prices, the carry kept and the carried-in work later ticks drop,
  to the sub-step after every tick, no row over-charging by more than 8% and none from 78 m/s up at
  all; a gate keeps no carry, a full hold and the legs' releases and caves conserve too. It prints
  the residual per row (about 10 s). The lane `sweptChargeConservation.lane.test.ts` runs the same
  rows at tick phases 1, 7, 19 and 31 and start offsets 0, 41 and 83 mm (about 1 min).
- **Swept ledger's carry debt** (ticket 471's slice 1, ticket 503; dark, the debt held by the
  recorder): `src/systems/vehicle/carryDebt.test.ts` checks the pure rule in `sweepDwell.ts` (a
  dropped carried-in work owed, paid off the first stations after the carried-in work, a fresh path
  and a gate owing none, an emptied tank's carry owed, no debt byte-identical to fix A).
  `src/systems/authority/sweptChargeExact.test.ts` cuts the same legs and rigs through the debt
  recorder (`recordingDebtTick`, measures in `sweptDebtFixtures.ts`) and wants the ledgers to charge
  the paid prices, the stored carry and the debt owed, to the sub-step after every tick, the debt
  never below 0 and 0 from 78 m/s up; a gate, a full hold and the 300 m/s rig's cells and charge
  with and without the debt hold too. It prints each row's debt, not pinned (about 10 s); the
  cells-band bars stay todos until #471's second slice wires the debt. The lane
  `sweptChargeExact.lane.test.ts` runs the rows at the twelve phases (about 1 min).
- **Carry release** (ticket 421): `src/systems/authority/carryRelease.test.ts` holds the carry's
  cell out of the stamp until one of its samples lies in the body's next-step slab
  (`CARRY_RELEASE_MARGIN_SAMPLES`), then wants it carved, priced again after the stamp's bite and
  paid on the tick the walk meets it, the surplus discarded: a table of gated cells (charge, rig,
  tip lock, core) answers as when held, no tick pays more than its carry plus its work, a carry
  toward a cell the carve reported gated is discarded, and the released cell yields in walk order
  (about 2 s). `vehicle/carryWalk.test.ts` checks the release on the pure walk (one released cell a
  tick, never past a stop, runs equal to the per-cell walk). `src/physics/cutSmoothness.test.ts`
  judges down, level and up legs per rig against its own commanded speed at 30 and 144 frames/s:
  no backward tick, none under 80% and at most 2% of ticks more than 5% off (the interim bar; since
  ticket 459 the 25 m/s up and 44 m/s down legs hold it, the 15 m/s and rig-heavy level legs are
  todos on #465), and holds the up legs (15 m/s, rig-heavy, 25 and 44 m/s) to
  #397's strict line on every ramped-up tick (ticket 432; the paid-not-free specs run an up leg
  too). `cutFollowRelease.test.ts` pairs the 15 m/s rig's level
  release phases main followed (`MAIN_FOLLOWED_LEVEL`) and wants their backward ticks no deeper and
  no larger in sum than main's; at 30 frames/s the sum is a todo since ticket 459, on #499 and #460
  since #491's toe stop, held meanwhile by a ratchet on the sum and the backward ticks (`TOE_RATCHET`)
  that may only shrink. Since ticket 506 the cut after the turn starts sooner, so the pairs are the
  phases this tree follows (`REPAIRED_FOLLOWED_LEVEL_PHASES`, re-paired once, main's bars kept) and
  the deepest back-off on them is held to main's −0.4557 m/s at 30 frames/s (a todo owned by #506
  at 144, which reads −0.4925); the airborne release is re-paired to phase 38.
- **Charge on density removed** (ticket 535, A6 "Option L", the TD shape 6228682000 with its
  geometry amendment, VS 6228848270): `src/systems/vehicle/cutCarry.test.ts` holds the pure carry
  (many small tallies pay and heat as the one of their sum, a gear cell at its share, a clamped
  tank's debt carried, never negative, absent at 0); `src/systems/world/groundEdit.test.ts` reads
  the carve's tally back from the densities and wants the densities byte-identical with or without
  it. `src/systems/authority/reportedCutCarry.test.ts` is the regression gate and the invariant on
  the report path: with `drill.exactCarry` on or off the cut, its cells, their order and its events
  are the same and only energy and the carries move; charged quanta times the denominator plus the
  carry equals the law work read from the ground (`cutCarryFixtures.ts`); sixty one-tick reports
  pay and heat as one of sixty ticks; a tank that cannot pay keeps the debt and strands the rig
  till the tow drops it; the carries round-trip the snapshot, are refused malformed, and are
  dropped at planet entry. The switch ships off until #541's heat change has landed (the GD's
  landing condition, G&V's line): the committed goldens are protocol 84's digests under the
  current header, and `src/logging/exactCarryOnGolden.test.ts` replays every golden with the switch on,
  only `casing-lined-band-2` and `collapse-band-2-grade-1` moving their end digest, to the digests
  it pins. The charge's specs and the lanes switch it on through `withDrillExactCarry`
  (`cutCarryFixtures.ts`), which puts the shipped value back. The charge bars both lanes gate are one definition,
  `src/systems/authority/lawChargeBars.ts`, as VS ruled them on the ticket (6230602042): the
  reference is the analytic law value (the drill's quanta a tick per drill tick of law work read
  from the ground, density removed times law time), never swept's own charge; on every row of at
  least 100 quanta, energy per unit of law work within 1% of the law (so at least 0.99, and under
  the 1.25 tank floor and the 1.098 ratchet) and heat fed to the gauge at least the law's less one
  drill tick (VS's amendment 6232473040: the heat bar reads the ticks the charge feeds the rule,
  before the #113 cap); a row under 100 quanta is quantized and logged; the ratio to swept is
  printed on every row, amber outside 5%, and gates nothing (swept's own under- and over-charge is
  #540's). The heat cap (`src/systems/authority/heatCapReadings.ts`): `heatRules.ts` settles at
  most one drill tick of heat per elapsed tick, so a bore wider than a cell's path feeds more law
  heat than the gauge takes, unless the authority's `heat.workUncapped` is on (ticket 541, shape
  (b), ships off): then the drilling segment heats every drill tick of work over its wall ticks.
  `src/systems/authority/heatWorkUncapped.test.ts` holds the rule (the same heat with the flag on
  or off while the work fits the elapsed ticks, every tick of work paid past them, the same at
  every cadence, the max and idle unchanged, a zero-elapsed charged report keeping its carry);
  `src/systems/bot/botHeat.test.ts` holds the planet-8 bot to the same digest and gauge either
  way, and `src/logging/heatWorkUncappedGolden.test.ts` every golden. Both lanes run the charged
  paths and swept with the flag on and main's with it off, and print on every row the ticks the
  rule could settle (all fed with the flag on, each report's fed ticks capped at its elapsed
  ticks without), the share of the law heat it drops (zero with the flag on), and the settled
  heat against the law and against main at both cadences, each red row with its reason (reason
  1: main @12 heats one tick per drilling tick, above the law; reason 2: the law-exact feed is
  bursty and the #113 cap clips it, the loss #541 lifts). They gate VS's ratchet as restated on
  #535 (6234309451, option ii) on every measurable charged row: settled heat per unit of law work
  no lower than the lesser of main's and the law's, less one drill tick. The loop lane's planet-8
  rig reads the gauge itself, only over the reports it was under its max for (a saturated report
  is measurement), and gates VS's exact settle (the gauge rises by what the rule can settle of
  the fed heat, within one drill tick), the gauge against the law (at least the law per unit of
  law work less one drill tick on each charged path; it was known red under #541 until the flag
  landed) and the TD's cadence check (the gauge per unit of law work at a report every tick and
  every 12 ticks within 1%); swept's gauge is printed beside them.
  The lanes run only when named: the loop lane `src/physics/exactCarry.lane.test.ts` plays the 25
  to 3600 m/s rigs, the stored ladder and a planet-8 rig through Rapier, every leg lined at casing
  grade 5 as the slab is (an unlined level leg buries the over-drilled rigs and reads their rescue
  as energy), on the swept, charged (at 12 ticks and every tick) and protocol-84 paths, gates the
  law bars, gates the charge on and off
  to the same cells, law work, metres and ticks, prints #514's geometry bars and the swept ratios
  beside them without gating them, and logs the most energy debt a tow dropped over the run
  against one cell's worth (VS: more goes to the GD) (about 10 min, writes
  `balance-report/exact-carry.ndjson`); the slab
  lane `src/systems/authority/lawCarrySlab.lane.test.ts` replays one prescribed pose list per speed
  on planet 1's fixed seed, flat and tilted 30 degrees, level and down, through the pure authority
  with no body, feeding the same poses to `drillStep` and to the report carve, so the 240 and
  3600 m/s rows have a swept comparison that never jams; it gates the same law bars and the same
  regression, prints the same ratchet readings (planet 1 is off the act, so the settleable ticks
  stand for the gauge's rise) and, when the loop lane's ndjson is present, holds its 25 and 44 m/s ratios to the
  law to the loop's within 1% (about 1 to 4 min on the loaded box, writes
  `balance-report/law-carry-slab.ndjson`);
  `src/logging/tripCellEnergy.lane.test.ts` plays the bot slice on its three pacing seeds and
  prices every trip per cell beside the bot's charge, the tank at least 1.138 times that figure
  (Systems' offline per-cell figure for the paired run; writes
  `balance-report/trip-cell-energy.ndjson`).
- **Swept law charge** (ticket 540, Systems' ruling 6231144515, the TD seam 6234992964 as VS
  6234998337 and the GD confirmed it): behind the authority dev flag `drill.sweptLawCharge` (off,
  flipped with `drill.sweptCut` behind the ticket's bars and #541) a `drillStep` is charged on the
  law work its carve removed, paid cells it clears in full included, with A6's rule on the one
  energy carry, energy alone (`payLawWorkEnergy`; the heat carry is never written on the swept
  path, which nothing there drains). `src/systems/authority/sweptLawCharge.test.ts` holds short
  slab tracks to the law bars (fast level, fast and slow down), the carry's exactness, the carve,
  its cells, chunks and heat byte-identical to the shipped swept cut, a lined row (lining the rig
  laid and cut again) and an unlined one both within 1% of the law (lining neither charged twice
  nor left out), the heat carry untouched and the carry shared with the report charge; it pins both
  flags off. Its law work is read command by command from each command's `GroundChanged` cells at
  the casing grade the sample was cut at (`lawWorkOfGroundChanges`, `lawWorkCut` on the slab run),
  since a reading of the whole run against its start prices re-cut lining as rock. The lane
  `src/systems/authority/sweptLawSlab.lane.test.ts` cuts every rig and track Systems listed (the
  slab lane's rigs, `lawSlabRigs.ts`) as `swept` and `swept law` and gates, on every row of at
  least 100 quanta, energy within 1% of the law, under the 1.25 floor and the 1.098 ratchet; on
  every row the carry's exactness, the carve and heat as shipped, and no refusal. It prints, never
  gates at landing, the heat fed against the law less one drill tick (the hard bar at the flip,
  VS 6234998337), the share the #113 cap drops (#541) and the shipped price against the law and
  the law charge (about 2 min, writes `balance-report/swept-law-slab.ndjson`).
- **Speed scaling at 84 and 840 m/s** (ticket 560, #551 ticket C): `src/systems/authority/speedSlabFixtures.ts`
  scripts a planet-1 column (plain rock, a first ore cell, a probe-gated ore cell, a cache tile
  under it) and cuts it by `drillStep` a tick and a report every 12, the body keeping pace with the
  cut, with the weakest rig whose law step reaches the stride (purchase 20 at 84 m/s, 31 at 840),
  so the authority's own bound clamps every step. `speedScaling.test.ts` holds, at each speed:
  ten seconds with no refusal; the gate reported once with the carry stopped dead and nothing under
  it carved; each scripted cell yielded once; every cell the stamp wholly crosses broken and none
  beyond its reach; the tank paying the law work removed exactly within the integer carry, under
  1.25 and 1.098; walk order and the cutting player's stamp; the same digest on a second run; the
  84 m/s casing (points never under 500 mm apart, rings at the full lag, one per 500 mm, no own
  lining cut); a cold slab and a prefetched one cutting the same ground. The bars run at 84, 840 and
  8400 m/s: ticket 558 lifted the 3600 m/s sub-step floor, and the slab's rock runs 160 rows under
  its foot, past the stamp's lead at 8400 m/s. The codex half (first-ore and material records once
  a cell, in walk order) is `src/features/codex/systems/contactsAtSpeed.test.ts`; the 84 m/s
  collapse outrun (#341 stands: cancelled, nothing refilled or crushed, cut events as past a
  tunnel that never warned, braced blocks never refilled) is
  `src/systems/authority/collapse/collapseAtSpeed.test.ts`, with its strip and rumble row in
  `hazardStripSampler.test.ts`; engine travel at 100 and 240 m/s on the authority path is
  `travelAtSpeed.test.ts`. The lane `speedScaling.lane.test.ts` times the moving ticks at width 7
  on a warm cache against p50 3 ms. The flag-off path above 18 m/s (`drill.sweptCut` off: the
  18 m/s clamp and the 950 mm capsule) is unsupported, not a pass; nothing here covers it.
- **Report capsule** (ticket 537, A7 "carve geometry at interval 1", the TD shape 6228947744
  section 4 with the HS additions, bounded to interval 1 by the GD's ruling after the prototype
  round 6241320435): behind the authority dev flag `drill.reportCapsule` (on) a pose report at
  interval 1, live only with `drill.exactCarry` on, whose drill ran the tick since the last charged
  report on the same facing and whose pose moved by at most one stamp radius, cuts the capsule
  from the previous pose's stamp centre to this one's on the swept cut's sub-step clock, charged
  as A6 charges the report (`src/systems/authority/reportedCapsule.ts`), its drill gear's cells cut
  on every tick of the bite (HS finding 1); a 12-tick report, any other interval, the exact carry
  off, a fresh bite, a turn, a standstill and a longer step cut protocol 86's bare disc byte for
  byte, so the flag-off game never carves a capsule.
  `src/systems/authority/reportedCapsule.test.ts` holds the continuity test, the interval-1 bound
  (a 12-tick report within the cap digests identically with the switch on and off), the 950 mm
  cap, the clock, the fallback byte for byte, the capsule cutting every cell the disc cut on a 3
  m/s track, and the exact carry off cutting the bare disc. `src/logging/reportCapsuleOffGolden.test.ts`
  replays every golden byte for byte as it ships and with the switch off, and with the exact
  carry on to A6's charged digests with the switch on or off (the goldens' reports are 12-tick;
  the pins live in `src/logging/chargedGoldenDigests.ts`, shared with `exactCarryOnGolden.test.ts`).
  The landing bars are the fixed-track lane's
  (`src/systems/authority/digSpeedTrack.lane.test.ts`, about 3 min, writes
  `balance-report/dig-speed-track.ndjson`): on the rows at 3, 8, 25 and 44 m/s, flat and tilted,
  level and down, a report every tick does at least the 5 m/s rig's law work per metre on the same
  track with cells per metre within 5% of it (bars 1 and 3, hard), with three named deviations held
  as known red under #545 (`src/systems/authority/carveGeometryKnownRed.ts`: the floor at 3 m/s
  flat level, cells per metre at 25 and 44 m/s tilted down; printed with the finding, never a
  pass, failing as expired once #545 closes or a named row turns green); parity against swept as
  shipped and the Step 0 re-read (bars 2 and 4) are printed amber, not gated; the same report with
  the capsule off (`every tick, disc`) is cut beside it so the capsule's own move shows per row,
  and #514's ratchet (against `every 12`, main's bare disc) and charge bars stay gated. The event
  stream spec `src/systems/authority/drillEventStream.test.ts` is the HS bar (b) on the capsule,
  every tick run with the exact carry on (every cell cut at 12 ticks cut once at every tick, the
  slow rows in order, extras inside the paid reach, `DrillGated` once per gated cell, and the gear
  cell the track's last report lists cut on that tick); `src/physics/drillReportCadence.test.ts`
  holds 30, 60 and 144 frames a second byte-identical, and `src/physics/vehicleLoop.test.ts` pins
  the ticket-339 dig's end with the exact carry on at the capsule's values.
- **Species seen-record** (ticket 546, the TD's contact rule 6243331970 as the GD amended it
  6243342631): behind the authority dev flag `codex.materialContact` (on) the codex writes
  `material:<species id>` for a cell the drill damaged, a gate stopped on, whose unit reached the
  hold, or the corer sampled. `src/features/codex/systems/materialContacts.test.ts` holds each
  route, once per player per species, two species of one ore type told apart, every never-write
  case (cells ahead, beside and behind a gate, a gate stop firing nothing but its one entry, the
  held sounder, probe and siphon and the echo sounder, a blast's unit, a bore's cell, the assay
  lens), a planet with no species, the `ore:` record unchanged, the snapshot round trip and the
  kind look provider revealing only the touched species; `materialNewGame.test.ts` that New Game
  clears it. `src/features/codex/materialContactOffGolden.test.ts` replays every golden with the
  switch off to protocol 88's digests (the four planet 1 mining goldens' old digests pinned there),
  and with the exact carry on to A6's charged digests; `chargedGoldenDigests.ts` holds the charged
  digests with the record on.
- **Dev flags as logged state** (ticket 547, the TD ruling on #547 and its amendment): the rules
  read `flagsOf(state)` (`src/systems/authority/devFlagState.ts`), the shipped
  `AUTHORITY_DEV_FLAGS` overlaid with the session's `devFlagDelta`, and `debug.setFlags` is the one
  writer. A spec switches a flag for play through that command; the `with*` fixtures that set the
  global stay for specs that replay a whole golden. `devFlagRules.test.ts` holds the command (only
  flags off their defaults kept, the sticky `devFlagsEverSet`, `unknown_flag`, flags never numbers,
  `not_session_host` for anyone but a shared session's lowest id, zero on flip to on per flag, the
  snapshot and save round trips, and no unlock, codex or item write on any flip);
  `devFlagFlips.test.ts` flips all seven off, on and off mid-drill at the cadence the flags give (no
  throw, no carry consumed after a turn-on, every stretch at or below the tank floor, the interval
  12 from the tick the exact carry goes off, replay digest-equal jumping and at 60 fps);
  `devFlagGates.test.ts` holds the gate under all 64 combinations (held, moving and swept: never
  cut, a held bite's `DrillGated` once); `devFlagReads.test.ts` scans that no rule names the global;
  `src/constants/devFlagRows.test.ts` that every flag has a panel row; `src/store/devFlagSessions.test.ts`
  that a load keeps its world's flags and New Game drops them. With no flag set no field is written,
  so every golden and the device save keep their digests. A balance report refuses a marked run
  (`src/logging/devFlagReport.ts`) and `perf:sessions` refuses a marked session.
- **Nose contact at speed** (ticket 564, C2 of #551: the TD's shape 6254962969 with the VS's
  amendment 6254978633 and the HS's conditions 6254968595): behind the authority dev flag
  `drill.noseContact`, the one that ships off until the combat damage track (#565) flips it, a
  `drillStep` engages the enemies its nose met on the body's walked path.
  `src/systems/authority/combat/contactAtSpeed.test.ts` drives the combat corridor at 5, 84, 840
  and 8400 m/s strides (`noseContactFixtures.ts`) and a column leg (`sweptRigFixtures.ts`'s
  `cutLeg` with `prepare`): on the shipped flags the dwell at speed against 5 m/s (VS bar b) is
  held known red under #565 (`noseContactKnownRed.ts`: printed with the finding, failing once the
  row turns green or #565 closes); with the flag named, the dwell is `max(1, ceil(...))` at every
  speed, an under-tier enemy dies on the tick it is met, the dwell grows with tier with no
  threshold, a rider leaves every cursor as an enemy-free pass, nothing is damaged twice, the
  flag off keeps the pose-only pin, an enemy-free pass is byte-identical either way, a snapshot
  mid-ride kills the same way once, a rider strikes no more, a full roster of under-tier crawlers
  dies on the ticks met, the wrecker and a crawler past the gate tip hold the cut (no
  `DrillGated`, reach and carry kept), and a crossed burrower is hit once with the gated column's
  cell events unchanged. The one damage seam is held there too (no contact module calls drill
  power; `kDrillVsEnemy` the same at every level; a new tip moves no dwell).
  `noseContactPath.test.ts` holds the path's geometry. The rows for families not built yet
  (`ore_thief`, `swarm_nests`, `core_guardian`) are `it.todo`.
- **Client dev flags and the browser's override** (ticket 548, the #548 ruling on #547): the
  pure rules are `src/systems/devFlags/` (`devFlagOverrides.test.ts`: only differences kept,
  unknown keys dropped, a flipped default reported and an opposing entry pinned, both with a
  flipped `shipped` passed in; `devFlagChoice.test.ts`: flags never numbers, the split between
  the client loop and one `debug.setFlags`, nothing sent for a choice that changes nothing;
  `clientDevFlags.test.ts`: `drill.sweptCut` pending until the drill is idle).
  `src/store/devFlagOverrides.test.ts` installs a memory `DevFlagStorage` (`installDevFlagStorage`,
  null in `afterEach`) and simulates a reload as `resetGameStore()` plus the same storage: a
  default boot and a set-then-reset boot play to main's digest, a session with no storage
  installed ignores a stored override, a toggle survives a reload and goes out at tick 0, New
  Game starts from the override and a load keeps its world's delta under it.
  `src/physics/clientFlagFlip.test.ts` flips `drill.sweptCut` mid-drill through the real loop;
  `src/shell/devFlagStorage.test.ts` holds which launches read the override (`?debug`, the tab
  marker; never a player's launch or a scenario) and `?noflags`. Specs and Playwright set flags
  with `ui.setDevFlags({...})` (a logged `debug.setFlags`, never `localStorage`) and read them with
  `ui.getDevFlags()`; `e2e/browser/devFlags.spec.ts` plants an override, reloads and clears it.
- **The debug flag panel, its gesture and badge** (ticket 549, the #548 ruling on #547): the
  view models are pure (`src/systems/devFlags/devFlagPanelModel.test.ts`: every row of the flag
  table listed, Client and Authority apart, a table row added later shown by itself, pending and
  host-only states, the pair warnings from each row's `needsOn`, a stale default offered for
  dropping; the badge counting flags off their defaults, running or remembered, and gone once all
  are back). `src/store/devFlagPanel.test.ts` installs a memory tab through
  `installDebugSessionEntry` (null in `afterEach`, with `installDevFlagStorage(null)`): the
  gesture marks the tab and reads the overrides, sending them at once in play or leaving them to
  the game the title starts; no entry means the panel opens and nothing is read; a switch is
  remembered across a reload, the reset restores the shipped flags and drops the badge, and a
  loaded save the override changed is named. `e2e/browser/mobile/devFlagPanel.spec.ts` holds the
  version label 1.5 s on both phones (a `pointerdown`/`pointerup` pair, since `tap()` cannot
  hold), toggles, reloads, resets, checks a player's launch ignores a stored override, and opens
  the panel from `?debug&title` with a tap.
- **The material pop A/B switch** (ticket 614, #442): `src/systems/materialPop/materialPopMode.test.ts`
  reads `?pop=` (A by default); `src/store/materialPopSlice.test.ts` starts a session on A or the
  URL's mode, switches it live, logs every start and switch as `material_pop_mode_set` and leaves
  the session snapshot and `debugApplied` as they were. Specs switch it with
  `ui.setMaterialPopMode('A' | 'B')` (logged, never a command, never marks the run) and read it with
  `ui.getMaterialPopMode()`; `e2e/browser/materialPop.spec.ts` covers the URL, the panel switch,
  the lines and a reload starting on A again.
- **Material pop option B** (ticket 616, #442): the pure rules sit in `src/systems/materialPop/`:
  `popFinds.test.ts` pops only a carved cell whose unit reached the hold (a `DrillGated` cell, a
  full hold and bare ground pop nothing), `popLook.test.ts` the 0.25 × 1.25^step ladder, the 0.8
  cap, the glint and the 0.35-0.5 s ease-in flight, `popFlight.test.ts` the rig-frame flight that
  never passes the nose and lands in a moving hold, `popThinning.test.ts` the 12/s (8/s narrow)
  rate, merges inside 0.25 s, commons dropped first and specials queued, and `popRows.test.ts` the
  VS rows (84, 840 and 8400 m/s on an all-rare and a common slab at 30 and 144 fps: pool ≤ 96, every
  rare shown per 0.25 s, frame cost printed). `src/systems/render/sprayPool.test.ts` holds the
  pool's 24 reserved slots, and `src/scene/materialPops.test.ts` drills a cell in B and A and
  asserts the hold, events and digest equal. `ui.getSprayStats().stats.pops` reads the thinning.
- **Material pop A beside B** (ticket 617, #442): `src/physics/materialPopSideBySide.test.ts` rides
  #570's probe row (straight down on planet 1 through the live loop) at L1, L20 and the 84 m/s rig,
  30 and 144 fps, once per mode. Both modes keep #570's bars (gap ≤ 0.10 m, no whole-cell drop,
  L20 descent/cut ≥ 0.891), the body and the digest match tick for tick (so #514's authority cost
  is the same), every B pop starts 0 or 1 tick after its cell's carve tick, A starts none, and the
  intake's cost per carved batch is printed. 840 and 8400 m/s are `it.todo` until a live rig
  reaches them; `popRows.test.ts` covers those speeds on the intake alone.
- **Known red** (ticket 419, the TD on #396 section 2; ticket 645): `knownRedVerdict`
  (`src/logging/knownRed.ts`) lets a marked gate run in full and print its covered problems as
  `known-red (#<finding>): ...` instead of failing them. The repo exports no marker: ticket 645
  deleted `CAMPAIGN_PACING_KNOWN_RED` (#417) after R3's radius re-baseline (#644), so
  `campaignPacingGate`'s stalled seeds and sawtooth misses (P5-P7 included) fail again. Lanes and
  specs keep local markers with a ruling (`carveGeometryKnownRed.ts`, `noseContactKnownRed.ts`). A
  marker fails when it names no finding ticket, when the finding's `docs/metrics/tickets/<n>.json`
  shows `closed` (it expires with the finding), and when the gate is green (delete the marker in the
  commit that turns it green). `knownRed.test.ts` fails on any exported marker: a new one needs a
  ruling and a code review, not a copy.
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
  (the #205 ratio; `drillGearPace.test.ts` reads it as a pace floor since the GD ruling on #392,
  bare ticks over geared ticks, so the boom and side cutters may speed the bot up but never slow
  it), and with drive 0 the head mines exactly the bare run's cells, ticks and ore value (no free
  cell, GD ruling on #280). The scenario
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
  `systems/travelShare.ts`) never pushed past a quarter of the run: it fails only when the bare
  run was at or under the quarter and Deep's goes over. A bare run that timed out is unmeasured
  and left out of that comparison, and a bare run already over the quarter leaves Deep ungated
  with a printed finding for #397's travel target (GD ruling on #392, option (a); the planet-16
  `it.todo` names it).
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
  `tech.incomeCap.maxShareBp` of a full hold of the band's ore after `tripCapAt` (since ticket 449
  the hold at its rarity-weighted mean, `cargo x V(t) x mu_b`, with the nominal share printed
  beside it; the golden also states that the drain and movers' +2 price, `RICHEST_LEAD`, moves no
  verdict), on P10, P20, P40
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
  departure (`planetLeads.ts`, purchases of drill power and majors of the tip). The bot holds
  drill_power to one purchase past the planet's on-curve level on every planet (ticket 552; #396's
  planet 1 lead of five majors went with its rows) and its forced core rule
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
  with TV mode on, iPhone 13 and Pixel 7 class phones in landscape and upright, a tablet both ways).
  The cell's expectations are the decision's own tables (zoom cap, render-scale floor, stage), not
  the game's formulas. It asserts the zoom cap and pillarbox (`ui.getCameraView()`'s
  `maxViewShortAxisMetres`, the `game-stage` box), the render-scale floor and a pin at it
  (`ui.getRenderStats()`'s `renderScaleFloor`), the #38 budgets at the widest zoom, every HUD and
  bay-screen text at least its 1280 x 800 size times the UI scale, TV mode's 2.22%/2.78% text,
  5.9% controls and 5% safe area, 44 px targets (56 on touch), a focus ring on each control Tab
  reaches, no art upscaled at the 12 m default, a lined casing cell reading at the widest zoom and
  the render-scale floor (`ui.getDrawnLiningAt`, ticket 315: about 24 px a cell on a phone), and
  the touch controls either way up (ticket 485): their sizes and clearances against the HUD's
  `data-hud` boxes, taps alone reaching every screen, the cluster following the dock, the
  left-handed mirror, and a stick run pressing the same action stream as its key run
  (`input.getActionStream()`, real touches through CDP). Each cell also writes the #173 look set;
  `npm run screens:update` puts it in `docs/screens/` for review, never compared
  ([docs/screens/README.md](screens/README.md)). Software WebGL at 4K is slow, so these projects
  allow 5 minutes a test and 30 s a wait.
- **Mobile projects** (#470 P1-10, ticket 481): `mobile-chromium-pixel7` (Playwright's `Pixel 7`
  on Chromium) and `mobile-webkit-iphone13` (`iPhone 13` on WebKit), both turned to the landscape
  screen of their matrix cell (`e2e/browser/mobile/mobileDevices.ts`), run `e2e/browser/mobile/` and
  the matrix's touch specs (`touchControls`, `tapAffordances`, `slotHoldRing`) with the cell's
  expectations. WebKit has no CDP: its touches are `locator.tap()` and `page.touchscreen.tap`, and
  the multi-touch specs (the stick's action stream, the pinch) skip there and run on the Pixel 7
  duplicate. Install the engine once with `npx playwright install webkit`; without it the iPhone
  project's tests skip with that hint before a browser launches, so `test:e2e:affected` stays green.
  `deviceSaveDigest.spec.ts` loads the committed device fixture through Continue on each engine and
  holds its `checkpoint_loaded` digest to `tests/golden/device-save.digest.json`, which node pins
  too (`loadedSaveDigest.test.ts`, rewritten by `npm run golden:update`): saves are identical
  across devices (#11, #12). `perfPhone.spec.ts` is the `npm run perf:phone` lane
  ([docs/perf/README.md](perf/README.md#phone-lane)) and skips elsewhere. All of it is emulation;
  no spec claims "verified on device" until the real-device check (#482).
- **Portrait framing** (ticket 484, spec #470): `e2e/browser/screens/portraitFraming.spec.ts` runs
  in the matrix's portrait cells (390x844, 412x915, 820x1180) and skips elsewhere. It reads
  `ui.getCameraView()`: 12 m down the height at the default with the collider at 7.5%, the width
  `viewHorizontalMetres` at the vertical extent times width over height at 8, 12 and 20 m, and a
  descent's screens a second (felt speed times pixels per metre over the height) against the same
  run resized to a 16:9 window, within the camera's smoothing. It also holds the render scale at
  the cell's floor and measures the hazard strip's track while digging down: along the long axis,
  30 vmin long, at most 8 pips. The law is pinned in node (`viewZoom.test.ts` and
  `speedFraming.test.ts`, which logs the horizontal cells ahead and warning seconds per speed row);
  `debugScreens.test.ts` holds the digest to one value at both orientations. Box Tester only.
- **Compact HUD** (#500, spec #470): `e2e/browser/hud/hudLayout.spec.ts` runs in the `chromium`
  project with each cell's viewport and touch set per `describe`: the four reference phones (390x844,
  412x915, 844x390, 915x412), the small-phone sweep (360x640, 320x568, 640x360) and the cells that
  keep the full HUD (1280x720 with a mouse, desktop, ultra-wide, TV at 1080p, both tablets). On a
  phone it reaches the worst case (drilling off the pad, `ui.stageHud` for a full hold and a threat
  marker, `ui.showHint('hint_cargo')`) and asserts that no two `data-hud` boxes overlap (an
  ancestor excepted), every text sits inside its box, the vehicle's body (`ui.getVehicleScreenBox`)
  is never covered while drilling, the hint chip is one line within 8% of the height with a 48 px
  dismiss, the Tech tree button is 48 px or more and off the stick zone and the cluster, and every
  box sits in the safe area. The clear view (the union of the `data-hud` boxes, touch buttons
  included, the stick zone not) is asserted at 70% upright and 65% sideways on the reference
  phones, in the worst case and with every control the debug build can own and three status chips
  (GD rulings 2 and 3 on #500; #486 closed the stacked gap), and logged as a `clear-view`
  annotation on the sweep. With every control owned, held sideways, the pairs a slot or the fire
  tile makes with a HUD box are logged as a `tile-lane` annotation, not asserted: #485 kept the
  sideways tile lane where it meets the readouts and the east threat marker. Box Tester only.
- **Layout tokens and the HUD coverage overlay** (ticket 682, spec #678): `tokens.css` declares
  every token of `src/data/design/designTokens.json` as `systems/views/designTokenCss.ts` names it,
  the phone values on `:root` and the desktop's under `data-layout="desktop"`, which the shell
  writes from the HUD density switch; `designTokenCss.test.ts` fails when the sheet and the JSON
  disagree, so a token changes in the JSON and its value is copied to the sheet. The overlay is
  switched by `ui.showHudCoverage(true|false)` and its numbers read by `ui.getHudCoverage()`
  (pure report: `systems/views/hudCoverageReport.ts`, every `data-hud` box but the touch
  controls). `e2e/browser/hud/hudCoverage.spec.ts` runs #689's four cells (360x640, 390x844,
  1280x800, 1440x900): the root's layout tokens, the band where the design puts it, the readout,
  and the reserved layout within 12% / 8%; the measured share of the HUD on screen is logged as a
  `hud-coverage` annotation; the screenshot suite (#689) asserts it. Box Tester only.
- **UI screenshot suite** (ticket 689, spec #678): `e2e/browser/ui/uiShots.spec.ts` runs the same
  four cells (`ui/uiShotCells.ts`) in the `chromium` project: the HUD on the surface and two tiles
  down, and every sheet in the `ui/uiShotSheets.ts` table (the bays, settings, the pause menu and
  its save page, the tech tree's map and list, the planet card, the title menu). Each test writes
  its shot first (`npm run ui:screens:update` puts them in `docs/ui/screens/`, never compared),
  then fails on text that runs out of its box or panel or a page that scrolls sideways, a target a
  tap can reach under 44 px (`MIN_TARGET_PX`; `data-tap-exact` amounts are text), and, on the HUD
  shots, the measured share over 12% / 8% (`ui.getHudCoverage()`'s `isMeasuredWithinBudget`) or a
  `data-hud` box, touch controls included, in the middle band. The measured share is logged as a
  `hud-coverage` annotation either way. A new sheet joins the table as one row. Box Tester only.
- **Shared sheet** (ticket 686, spec #678): the rules are pure (`systems/views/sheetLayout.ts`:
  placement, shutter, tab bar; `cardReveal.ts`: reveal or act), the open tab and revealed card are
  the store's sheet slice, and the frame, cards and tab bar are server-rendered as views
  (`ui/sheet/baseSheet.test.ts`, which also reads their sheets for the 44 px targets and the 14 px
  floor). Nothing in play opens the sheet before #687/#688, so the browser specs open it on the
  example slice's probe tabs: `features.example.showSheetTabs()`, then `ui.openSheet('example.cards')`;
  `ui.getSheet()` reads the tab, placement and revealed card and `features.example.getActedCard()`
  the card whose act ran. `e2e/browser/ui/sheet.spec.ts` runs the four cells: a phone's first tap
  reveals and the second acts with Close and the tabs out of the top 15%; desktop docks, narrowing
  the stage by `layout.sheetDock.widthPx`, and widens it again on Close; Escape closes it
  everywhere. The screenshot suite shoots it as `base-sheet`. Box Tester only.
- **Warning layer** (ticket 685, spec #678): the ladder is pure (`systems/views/warningWatch.ts`:
  each tier fires once on the way in and re-arms 5% above it, the deepest of several at once rings
  alone, the glow holds the deepest tier now), fed from the HUD's readings through the store's
  warning slice; a test scene in `warningWatch.test.ts` drives hull, fuel, a collapse and heat on
  planet 8 through real commands plus a full hold and sees each fire once. The bells
  (`systems/audio/warnBells.ts`) and the haptics listen to `store/warningBroadcast.ts`, never the
  store. `ui.getWarnings()` reads the glow, each readout's fired tier and the run's firings in
  order. `e2e/browser/hud/warningLayer.spec.ts` runs 360x640 and 1280x800: hull and fuel down the
  ladder, the staged full hold, a collapse under the rig, each tier exactly once; the glow has no
  `data-hud` box, no box enters the middle band, and the status row holds 3 icons on the phone and
  6 on desktop. Box Tester only.
- **Touch controls held upright** (ticket 485, spec #470): `e2e/browser/screens/portraitTouch.spec.ts`
  runs in the matrix's portrait touch cells (390x844, 412x915, 820x1180) and skips elsewhere. It
  measures the stick zone (the lower 45% of the height from the thumb's lower corner, ending at a
  home bar set as `--safe-bottom`), the cluster (two rows on a phone, three on the tablet, a gap
  clear of the zone), and the slot column and fire tile on the free edge above the cluster. With a
  stacked loadout (guns, a charge rack, five slots, the bore gun) every `data-hud` control sits
  inside the safe area, apart, off every other `data-hud` box and off the vehicle's body, for
  either hand. On a phone no HUD box meets the zone; on the tablet, whose full HUD keeps its
  bottom plaques, the boxes the zone meets are logged as a `stick-zone` annotation. The stick's
  and the keys' action streams, the pause button, the badge, the fire tile and the slot hold ring
  run upright too (`touchControls`, `fireTile`, `slotHoldRing`). Box Tester only.
- **Upright HUD rows** (#486, spec #470): `e2e/browser/hud/portraitHud.spec.ts` runs the upright
  cells (390x844, 412x915, 360x640, 320x568) in the worst case above with a threat at each of the
  eight octants (`ui.stageHud({ threatOctants })`) and three status chips, and asserts no two
  `data-hud` boxes overlap, every text sits inside its box, every threat chip sits in the prompts'
  row and no row reaches the stick zone or a touch button, the vehicle stays uncovered, a clean
  tap on the status row opens its card with the chips' words, and `ui.getOverlayStats()` holds at
  most 16 seated cards. The stacked clear view is also pinned in node with the most controls the
  vehicle layer can show (`hudClearView.test.ts`, over boxes measured on the phone cells). Box
  Tester only.
- **Upright panels** (#487, spec #470): `e2e/browser/screens/portraitPanels.spec.ts` runs in the
  matrix's portrait touch cells (390x844, 412x915, 820x1180) and skips elsewhere. On the Sell bay,
  the Upgrade bay, the settings, the pause menu and its save page, the title menu, the planet card
  and the tech tree (map, list and an open card) it asserts the panel sits in the safe area, no
  text of its own runs out of it sideways (the workshop carousel and the tree map pan, so their
  frames are judged instead), every button, field and tab is at least 48 px both ways, no two
  targets a finger can reach overlap (a target scrolled away or under a sheet counts only where
  a tap can land), and the bays and the planet card cover no touch button and not the compact
  HUD's Tech tree button. The workshop's six plaques sit in one carousel, clear of the car, each
  showing its level, price and any Needs line with no hover or hold. The tree's List orders nodes
  researchable, then short of money, then locked, then researched, and Next affordable opens the
  first researchable one's card. On the phones a one-finger drag pans the map, a two-finger pinch
  zooms it within 1 to 2 times, and a tapped node opens a bottom sheet that Close takes down
  (real touches through CDP). The ordering and pinch maths are pinned in node
  (`treeList.test.ts`, `mapGestures.test.ts`). Box Tester only.
- **Portrait matrix and rotation** (ticket 488, spec #470): `e2e/browser/screens/portraitMatrix.spec.ts`
  runs in the matrix's portrait cells (390x844, 412x915, 820x1180) and skips elsewhere: no
  turn-your-device card, no two `data-hud` boxes over each other, and every touch control inside
  the safe area, off the other controls and off the HUD, as the game opens, sampled through a dig
  with the ticks advancing, and docked at each bay. `screenLayout.spec.ts` runs its canvas, focus
  ring and ground rows upright too (pixels per metre are the height over the view either way up,
  ticket 484); its text-size and 56 px rows stay sideways, as held upright `portraitPanels` judges
  the panels. `rotation.spec.ts` turns every touch cell the other way up and back with no reload:
  at rest, and mid-dig, where the rig keeps digging the same session and the same layout rows hold
  each way up. The review set (`reviewShots.spec.ts`) shoots the portrait cells' dock, dig,
  workshop and settings upright, and `rotated` turned sideways mid-dig. Emulation only (Chromium
  with `isMobile`/`hasTouch`), no on-device claim. Box Tester only.
- **Drill-down run** (ticket 416): `e2e/browser/drillDown.spec.ts` holds the real Down key for 10 s
  on the P1 surface from `scenarios/drill-down-start.scenario.json`, at stored drill_power steps 1
  (the save's), 5, 10, 15 and 20 (`debug.setUpgrade`, ticket 434), and writes one row per run (start and end position, depth gained, cells/s,
  m/s, level, seed, build commit, time) that the Tester appends to `drill-down.ndjson` on
  `test-metrics` for the Tests tab and the Drill speed panel ([loop-status.md](loop-status.md#drill-down-run-ticket-416)). It
  watches and does not judge: it asserts only that the vehicle went down and did not stall at 0.
  The speed ladder assertion is #409's. Box Tester slow tier and nightly only.
- **L20 drill-speed anchor** (ticket 560): `e2e/browser/drillSpeedAnchor.spec.ts` holds the real
  Down key from the same start save at drill purchases 1 and 20 and reads the felt speed between
  the first and the last report inside band 1, by report ticks, not wall time. It asserts
  D(20) / D(1) in [60, 65] and prints the L20 m/s against 83.9 m/s (VS's -2.7% to +0.5% band,
  reported), with the band-1 hardness and tip. Box Tester only.
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
- **Frame-cost A/B on the packaged soak** (ticket 526, the merge gate for #450 and #451):
  `soakMemory.mjs --electron <look-on build> --frame-ab <look-off build> [--gpu]` launches the two
  packaged builds in turn (off, on, off, on), holds P1 band 5 at 20 m zoom in a 1280x800 window
  with vsync off, samples the frame p50 once a second and counts shader programs linked during the
  hold. It writes `frame-ab.json` for `perf:record` (ids `frameAbElectron.*` on a real GPU,
  `frameAbElectronSwiftShader.*` on a dry run) and prints the bar (p50 at most +0.5 ms, no
  recompile), the verdict and the phone line from #482. A SwiftShader run is a dry run, labelled
  "not GPU numbers", and never counts for or against the bar. The bar is judged on a real GPU by
  the Perf Tester or Bjor. The bar and the report are pure and tested in `scripts/soak/frameAb.test.mjs`.
  How to build both sides, run and read it: [docs/perf/frame-ab.md](perf/frame-ab.md).
- **Memory and frame samples in the run log** (#121): dev, scenario and debug runs log `perf_sample`
  every second of frames (now with `frameMsP99` and `longTasks`, the frames over 50 ms, and
  `ticksDroppedByCap`, the due ticks the 30-step frame cap cut since the last sample, ticket 480) and
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
