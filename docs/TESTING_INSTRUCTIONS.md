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
- Set up state through a **start scenario** (`StartScenario`, `useGameStore.applyStartScenario`) or a
  store action, never by assigning private fields.
- Time is an argument: tests pass `dt` or an injected clock (`createRunLog({ secondsSinceStart })`).
  Where timing matters, assert the same outcome at two step rates.
- Determinism: seed everything. A pinned-sequence test (see `seededRandom.test.ts`) makes a generator
  change a visible decision; update the pins in the same commit and say why, since every saved seed changes.
- Assert returned values and resulting state, not call order or internals.
- Do not pin known bugs. Do not test private helpers, JSX shape or class names.

## 3. Scenarios and the debug API

A **start scenario** is the state a player would have had to earn, written down instead of played
for (design doc 19-20). Rules live in `src/systems/startScenario.ts`; they are **refused, never
trimmed**: every problem is listed and nothing is applied.

- Browser: `?scenario=<json>` at launch (parsed by `parseStartScenario`); `?debug` (or the dev build)
  exposes `window.steampunkDebug` (the `DebugApi`) and `window.steampunkRunLog()` (the NDJSON so far,
  browser shell only).
- Fields today: `planetTier`, `planetSeed`, `depth`, `money`. Add a field with its validation rule, its
  store wiring and its test in one commit.
- Stubs in `src/debug/debugApi.ts` throw `DebugCommandNotImplementedError`; implement them with the
  system they poke, never as a silent no-op.

## 4. Before every commit

`npm run typecheck`, the touched Vitest files green (and `npm run lint` for boundary rules). By hand for
anything visual: `npm run dev`, then say what you checked in the commit message.
