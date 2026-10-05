/**
 * The debug API's `ui` and `input` namespaces (#33 section 9, #11 amendment 2). `ui` reads the
 * screens' view models and sets local presentation settings: no command, no log line, not in the
 * digest, never `debugApplied`. `input` presses actions at the action layer, so a tap travels the
 * same path as a key and its commands land in `commands.ndjson` like real play; bindings are
 * read and set refused-whole. None of it is a `debug.*` command, and all of it exists only on
 * `window.steampunkDebug`, which the debug flag alone exposes.
 */
import { useGameStore } from '../store/gameStore'
import { pressAction, releaseAction } from '../store/inputRuntime'
import { readHudModel, readPlatformModel } from '../store/screenReads'
import {
  isActionId,
  type ActionId,
  type BindingOverrides,
  type Bindings,
} from '../systems/input/actionMap'
import {
  preferenceProblems,
  type PreferenceName,
  type Preferences,
} from '../systems/input/preferences'
import type { HudModel } from '../systems/views/hudModel'
import type { PlatformModel } from '../systems/views/platformModel'

export type DebugResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; problems: string[] }

export interface DebugUi {
  /** `rotating` (local down at the bottom of the screen) or `fixed` (#13 accessibility). */
  setCameraMode(mode: string): DebugResult
  /** `cameraMode`, `shake`, `flashes` or `hintsEnabled`. */
  setPref(name: string, value: unknown): DebugResult
  getPrefs(): DebugResult<{ prefs: Preferences }>
  getHudModel(): DebugResult<{ model: HudModel }>
  getPlatformModel(): DebugResult<{ model: PlatformModel }>
}

export interface DebugInput {
  /** Holds an action down (a held aim drives; a press action reacts once). */
  press(actionId: string): DebugResult
  release(actionId: string): DebugResult
  /** Press then release: one edge action, as a key tap makes it. */
  tap(actionId: string): DebugResult
  getBindings(): DebugResult<{ bindings: Bindings; overrides: BindingOverrides }>
  /** The player's sparse override; refused whole with every problem, the current one stays. */
  setBindings(overrides: unknown): DebugResult
}

const game = () => useGameStore.getState()

export function createDebugUi(): DebugUi {
  return {
    setCameraMode: (mode) => setPreferenceUnlessRefused('cameraMode', mode),
    setPref: (name, value) => setPreferenceUnlessRefused(name, value),
    getPrefs: () => ({ ok: true, prefs: game().prefs }),
    getHudModel: () => ({ ok: true, model: readHudModel() }),
    getPlatformModel: () => ({ ok: true, model: readPlatformModel() }),
  }
}

export function createDebugInput(): DebugInput {
  return {
    press: (actionId) => runWithAction(actionId, pressAction),
    release: (actionId) => runWithAction(actionId, releaseAction),
    tap: (actionId) =>
      runWithAction(actionId, (action) => {
        pressAction(action)
        releaseAction(action)
      }),
    getBindings: () => ({ ok: true, bindings: game().bindings, overrides: game().prefs.bindings }),
    setBindings: (overrides) => resultOf(game().setBindings(overrides)),
  }
}

function setPreferenceUnlessRefused(name: unknown, value: unknown): DebugResult {
  const problems = preferenceProblems(name, value)
  if (problems.length === 0) game().setPreference(name as PreferenceName, value)
  return resultOf(problems)
}

function runWithAction(actionId: unknown, run: (action: ActionId) => void): DebugResult {
  if (!isActionId(actionId)) return resultOf([`${JSON.stringify(actionId)} is not an action id`])
  run(actionId)
  return { ok: true }
}

function resultOf(problems: string[]): DebugResult {
  return problems.length > 0 ? { ok: false, problems } : { ok: true }
}
