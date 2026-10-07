/**
 * The debug API's `ui` and `input` namespaces (#33 section 9, #11 amendment 2). `ui` reads the
 * screens' view models and the audio model (#49) and sets local presentation settings: no
 * command, no log line, not in the digest, never `debugApplied`. `input` presses actions at the action layer, so a tap travels the
 * same path as a key and its commands land in `commands.ndjson` like real play; bindings are
 * read and set refused-whole. `ui.getBayPresentation` reads what the bay screen and its preview
 * wrote while drawing (#45, #44). None of it is a `debug.*` command, and all of it exists only on
 * `window.steampunkDebug`, which the debug flag alone exposes.
 */
import { cameraPresence } from '../scene/cameraPresence'
import { lightPresence } from '../scene/lightPresence'
import { previewPresence } from '../scene/previewPresence'
import { renderPresence } from '../scene/renderPresence'
import { useGameStore } from '../store/gameStore'
import {
  pressAction,
  readActionStream,
  releaseAction,
  type ActionEdge,
} from '../store/inputRuntime'
import {
  readAudioModel,
  readHudModel,
  readRefineryBayModel,
  readSellBayModel,
  readUpgradeBayModel,
} from '../store/screenReads'
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
import { renderScalePinProblems } from '../systems/render/renderScale'
import { cameraViewOf, viewShortAxisProblems, type CameraView } from '../systems/render/viewZoom'
import { shopTypeOf, type ShopType } from '../systems/views/bayPresentation'
import type { HudModel } from '../systems/views/hudModel'
import type { RefineryBayModel } from '../systems/views/refineryBayModel'
import type { SellBayModel } from '../systems/views/sellBayModel'
import type { UpgradeBayModel } from '../systems/views/upgradeBayModel'
import { readOverlayStats, type OverlayStats } from '../ui/overlay/overlaySeatTable'
import { bayScreenPresence } from '../ui/platform/bayScreenPresence'
import { screenIdProblems } from '../ui/registries/screens'
import { readFittedScreen } from '../ui/stage/screenFit'
import type { ScreenLayout } from '../systems/views/screenLayout'
import { readRendererMemory, type RendererMemory } from './debugMemory'

export type DebugResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; problems: string[] }

export interface DebugUi {
  /** `rotating` (local down at the bottom of the screen) or `fixed` (#13 accessibility). */
  setCameraMode(mode: string): DebugResult
  /** Any setting the overlay lists (`PREFERENCE_NAMES`), such as `tvMode` (#173). */
  setPref(name: string, value: unknown): DebugResult
  getPrefs(): DebugResult<{ prefs: Preferences }>
  /** The player's zoom, metres across the short axis from 8 to 20 (#39); refused outside it. */
  setZoom(viewShortAxisMetres: unknown): DebugResult
  /** The framing on screen now: the eased zoom, pixels per metre and the collider's share (#39). */
  getCameraView(): DebugResult<{ view: CameraView }>
  /** What the last frame drew and cost (#38 acceptance 1-3): draw calls, blocks, lights, scale. */
  getRenderStats(): DebugResult<{ stats: RenderStats }>
  /** Live geometries, textures and compiled programs in three's `renderer.info` (#119). */
  getRendererMemory(): DebugResult<RendererMemory>
  /** Holds the render scale (0 to 1, clamped to the 1080p floor), or `null` to adapt again (#38). */
  setRenderScale(scale: unknown): DebugResult
  getHudModel(): DebugResult<{ model: HudModel }>
  /** The bay screens (#37, #105), as each would draw now; their buttons carry `wrong_bay` away. */
  getSellBayModel(): DebugResult<{ model: SellBayModel }>
  getUpgradeBayModel(): DebugResult<{ model: UpgradeBayModel }>
  getRefineryBayModel(): DebugResult<{ model: RefineryBayModel }>
  /**
   * How the bay screen presents now (#45, #44, #39): its shutter, the smallest text against the
   * short axis, and the share of the preview panel's height the vehicle fills (0 when closed).
   */
  getBayPresentation(): DebugResult<{ presentation: BayPresentation }>
  /** The music's layer targets, settings and the run's stingers in order (#49). */
  getAudioModel(): DebugResult<{ model: AudioModel }>
  /** How the UI fits the screen (#173): stage, UI scale, TV safe inset, smallest control. */
  getScreenLayout(): DebugResult<{ layout: ScreenLayout }>
  /** The HUD overlay's cards holding a seat now, and how many the 16-card cap evicted (#208). */
  getOverlayStats(): DebugResult<{ stats: OverlayStats }>
  /** Opens a slice's registered full screen (ticket 211); refused for an id no slice registered. */
  openScreen(screenId: unknown): DebugResult
  /** The slice screen drawn now, or null; `input.tap('ui_cancel')` dismisses it like Escape. */
  getOpenScreen(): DebugResult<{ screenId: string | null }>
}

export interface BayPresentation {
  shutter: typeof bayScreenPresence
  type: ShopType
  preview: typeof previewPresence
}

export type RenderStats = typeof renderPresence & {
  headlamps: number
  pointLights: number
  pointLightIds: string[]
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
  /**
   * The actions pressed and held ones released, oldest first, from keys, touches and this API
   * alike (#173: a touch run and its key run press the same stream). An unlogged read.
   */
  getActionStream(): DebugResult<{ stream: ActionEdge[] }>
}

const game = () => useGameStore.getState()

export function createDebugUi(): DebugUi {
  return {
    setCameraMode: (mode) => setPreferenceUnlessRefused('cameraMode', mode),
    setPref: (name, value) => setPreferenceUnlessRefused(name, value),
    getPrefs: () => ({ ok: true, prefs: game().prefs }),
    setZoom: setZoomUnlessRefused,
    getCameraView: () => ({ ok: true, view: cameraViewOnScreen() }),
    getRenderStats: () => ({ ok: true, stats: renderStatsNow() }),
    getRendererMemory: readRendererMemory,
    setRenderScale: pinRenderScaleUnlessRefused,
    getHudModel: () => ({ ok: true, model: readHudModel() }),
    getSellBayModel: () => ({ ok: true, model: readSellBayModel() }),
    getUpgradeBayModel: () => ({ ok: true, model: readUpgradeBayModel() }),
    getRefineryBayModel: () => ({ ok: true, model: readRefineryBayModel() }),
    getBayPresentation: () => ({ ok: true, presentation: bayPresentationNow() }),
    getAudioModel: () => ({ ok: true, model: readAudioModel() }),
    getScreenLayout: screenLayoutNow,
    getOverlayStats: () => ({ ok: true, stats: readOverlayStats() }),
    openScreen: openScreenUnlessRefused,
    getOpenScreen: () => ({ ok: true, screenId: game().openScreenId }),
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
    getActionStream: () => ({ ok: true, stream: [...readActionStream()] }),
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

function pinRenderScaleUnlessRefused(scale: unknown): DebugResult {
  const problems = renderScalePinProblems(scale)
  if (problems.length === 0) game().pinRenderScale(scale)
  return resultOf(problems)
}

function openScreenUnlessRefused(screenId: unknown): DebugResult {
  const problems = screenIdProblems(screenId)
  if (problems.length === 0) game().openScreen(screenId)
  return resultOf(problems)
}

function renderStatsNow(): RenderStats {
  return {
    ...renderPresence,
    headlamps: lightPresence.headlamps,
    pointLights: lightPresence.pointLights.length,
    pointLightIds: lightPresence.pointLights.map((light) => light.id),
  }
}

function bayPresentationNow(): BayPresentation {
  return {
    shutter: { ...bayScreenPresence },
    type: shopTypeOf(
      cameraPresence.widthPixels,
      cameraPresence.heightPixels,
      readFittedScreen()?.shopTextPixels ?? 0,
    ),
    preview: { ...previewPresence },
  }
}

function screenLayoutNow(): DebugResult<{ layout: ScreenLayout }> {
  const layout = readFittedScreen()
  if (layout === null) return { ok: false, problems: ['the screen has not been laid out yet'] }
  return { ok: true, layout }
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
