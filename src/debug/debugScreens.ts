/**
 * The debug API's `ui` and `input` namespaces (#33 section 9, #11 amendment 2). `ui` reads the
 * screens' view models and the audio model (#49) and sets local presentation settings: no
 * command, no log line, not in the digest, never `debugApplied`. `input` presses actions at the action layer, so a tap travels the
 * same path as a key and its commands land in `commands.ndjson` like real play; bindings are
 * read and set refused-whole. None of it is a `debug.*` command, and all of it exists only on
 * `window.steampunkDebug`, which the debug flag alone exposes.
 */
import { cameraPresence } from '../scene/cameraPresence'
import { useGameStore } from '../store/gameStore'
import { pressAction, releaseAction } from '../store/inputRuntime'
import { readAudioModel, readHudModel, readPlatformModel } from '../store/screenReads'
import type { AudioModel } from '../systems/audio/audioModel'
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
import { cameraViewOf, viewShortAxisProblems, type CameraView } from '../systems/render/viewZoom'
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
  /** The player's zoom, metres across the short axis from 8 to 20 (#39); refused outside it. */
  setZoom(viewShortAxisMetres: unknown): DebugResult
  /** The framing on screen now: the eased zoom, pixels per metre and the collider's share (#39). */
  getCameraView(): DebugResult<{ view: CameraView }>
  getHudModel(): DebugResult<{ model: HudModel }>
  getPlatformModel(): DebugResult<{ model: PlatformModel }>
  /** The music's layer targets, settings and the run's stingers in order (#49). */
  getAudioModel(): DebugResult<{ model: AudioModel }>
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
    setZoom: setZoomUnlessRefused,
    getCameraView: () => ({ ok: true, view: cameraViewOnScreen() }),
    getHudModel: () => ({ ok: true, model: readHudModel() }),
    getPlatformModel: () => ({ ok: true, model: readPlatformModel() }),
    getAudioModel: () => ({ ok: true, model: readAudioModel() }),
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

function setZoomUnlessRefused(viewShortAxisMetres: unknown): DebugResult {
  const problems = viewShortAxisProblems(viewShortAxisMetres)
  if (problems.length === 0) game().setViewShortAxis(viewShortAxisMetres)
  return resultOf(problems)
}

function cameraViewOnScreen(): CameraView {
  const { widthPixels, heightPixels, viewShortAxisMetres } = cameraPresence
  return cameraViewOf(widthPixels, heightPixels, viewShortAxisMetres)
}

function runWithAction(actionId: unknown, run: (action: ActionId) => void): DebugResult {
  if (!isActionId(actionId)) return resultOf([`${JSON.stringify(actionId)} is not an action id`])
  run(actionId)
  return { ok: true }
}

function resultOf(problems: string[]): DebugResult {
  return problems.length > 0 ? { ok: false, problems } : { ok: true }
}
