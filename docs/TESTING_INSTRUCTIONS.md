# Testing instructions

Read this before writing or running any test in this repository. It is the single place the testing
rules live; `CLAUDE.md` summarises it. Modelled on the `infernal-bistro` rulebook, minus its
Playwright layer, which this repo does not have yet.

## 1. The layers

|        | `npm test` (Vitest)                                         | Browser end-to-end                     |
| ------ | ----------------------------------------------------------- | -------------------------------------- |
| Runs   | Node, no DOM, no physics, no canvas                         | **Does not exist yet**                 |
| Covers | Formulas, store actions, logging, scenario rules, debug API | What the camera shows, how input feels |
| Status | The whole automated layer. Run it.                          | Verify by hand in `npm run dev`        |

`vite.config.ts` includes only `src/**/*.test.ts`. There are no component tests: if a change can
only be trusted by looking at it, look at it and say so in the commit.

### Where a test belongs

- `src/systems/` – pure rules. No store, React, Rapier, `import.meta.glob`, clock or `Math.random` in the
  import graph (ESLint enforces it). The default home for any rule.
- `src/store/` – what an action does to the world; reset with `resetGameStore()` in `beforeEach`.
- `src/logging/`, `src/debug/` – event stamping, NDJSON, sinks, debug commands.
- `electron/` – no tests yet (the main process is thin). Its one rule worth testing, run-id
  validation in `runLogFiles.cts`, mirrors `isValidRunId`, which is tested.

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
built yet (`depthBp`, inventory, upgrades, unlocks, core fragments) are validated, then refused with a
problem naming what is missing.

- Applying a scenario submits `debug.*` authority commands (so it replays from `commands.ndjson` and logs
  `debug_command_applied`), then runs its script (`fastForward` steps).
- Browser: `?scenario=<json>` at launch (parsed by `parseScenario`); `?debug` (or the dev build) exposes
  `window.steampunkDebug` (the `DebugApi`), `window.steampunkRunLog()` and `window.steampunkRunCommands()`
  (the NDJSON so far, browser shell only).
- Every wired debug method answers `{ ok: true, ... }` or `{ ok: false, problems }`: `setPlanet`,
  `setPlanetSeed`, `teleportToDepthTiles`, `giveMoney` (a decimal string such as `"1e30"`), `applyScenario`,
  `fastForward(ticks, commands?)`, `snapshot()` and `restore(snapshot)`.
- Run-log specs: every emitted line must pass `runEventProblems` (the schema registry in
  `src/logging/eventNames.ts`); a summary is always `deriveSummary(events)`.
- Money in tests: compare canonical strings (`toCanonical`) or `Money` values; `src/testSetup.ts` registers
  a value-equality tester, so `toEqual(fromCanonical('1.5'))` matches `1.50`.
- Store actions that change world or economy go through the authority: to check that one submits instead
  of writing state, pass a spy `Authority` to `resetGameStore(authority)`.
- Stubs in `src/debug/debugApi.ts` throw `DebugCommandNotImplementedError`; implement them with the
  system they poke, never as a silent no-op.

## 4. Before every commit

`npm run typecheck`, the touched Vitest files green (and `npm run lint` for boundary rules). By hand for
anything visual: `npm run dev`, then say what you checked in the commit message.
