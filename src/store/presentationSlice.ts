/**
 * The game store's presentation slice (#33): local settings and rebinding, which layer is open
 * (the artefact cache's cards too, #46), menu focus and the travel confirmation. None of it is authority state, a command, a log line or
 * part of the digest; buttons that change the world submit ordinary authority commands.
 *
 * Kept beside the store so the store stays one reason to change; `gameStore` spreads it in, so
 * there is still one store that owns its actions.
 */
import {
  ACTION_MAP,
  bindingsWithOverrides,
  defaultBindings,
  type ActionId,
  type BindingOverrides,
  type Bindings,
  type InputContext,
} from '../systems/input/actionMap'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { isChoiceOpenAfter } from '../systems/views/artefactChoiceModel'
import { topLayerOf } from '../systems/input/inputRouting'
import {
  DEFAULT_PREFERENCES,
  nextMusicVolume,
  preferenceProblems,
  withPreference,
  type PreferenceName,
  type Preferences,
  type PreferencesReading,
} from '../systems/input/preferences'
import { otherCameraMode, type CameraMode } from '../systems/render/cameraTurn'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../constants/scene'
import {
  viewShortAxisProblems,
  zoomedIn,
  zoomedOut,
  type ZoomChange,
} from '../systems/render/viewZoom'
import { renderScalePinProblems } from '../systems/render/renderScale'
import { focusOnScreen, stepFocus } from '../systems/views/menuFocus'
import type { ButtonAction, ScreenButton } from '../systems/views/viewParts'
import { refuseProblems, submitCommand } from './authorityLink'
import { writePreferences } from './preferencesFile'
import { menuScreenOf, type ScreenSources } from './screenModels'
import type { VehicleReplica } from './vehicleReplica'

export interface PresentationValues {
  prefs: Preferences
  /** The keys in force: the overrides in `prefs.bindings` on the shipped defaults. */
  bindings: Bindings
  /**
   * The problems of the last refused rebinding, or why the preferences file's bindings were reset
   * at start (#40); empty once a rebinding is accepted.
   */
  bindingProblems: readonly string[]
  isSettingsOpen: boolean
  /** The artefact cache's three cards (#46): open on this player's `artefact_open`. */
  isArtefactChoiceOpen: boolean
  focusedControlId: string | null
  /** The first press of Travel arms it; only the second submits (#33 section 6). */
  isTravelArmed: boolean
  /** The action waiting for "press a key to rebind". */
  rebindingActionId: ActionId | null
  /** A render scale held by the debug API (#38 "a toggle can pin it"); null adapts to the GPU. */
  renderScalePin: number | null
}

export interface PresentationActions {
  /** One setting; refused (thrown) when the name or value is not a setting's. */
  setPreference(name: PreferenceName, value: unknown): void
  setCameraMode(mode: CameraMode): void
  togglePreference(name: PreferenceName): void
  /** Metres across the short axis, 8 to 20 (#39); refused (thrown) outside the band. */
  setViewShortAxis(metres: unknown): void
  /** One `zoom_in`/`zoom_out` step of 1.25, clamped, or `zoom_reset` to 12 m. */
  zoom(change: ZoomChange): void
  /** Holds the render scale (clamped to the 1080p floor), or `null` to adapt; refused (thrown). */
  pinRenderScale(scale: unknown): void
  /** The preferences file read at start; the file owner already wrote back any reset. */
  adoptPreferences(reading: PreferencesReading): void
  /** The hints and transmissions shown so far (#16), kept in the preferences file. */
  rememberSeenHints(seenHints: readonly string[]): void
  /** Refused whole: returns the problems and changes nothing, or [] and the overrides rule. */
  setBindings(overrides: unknown): string[]
  resetBindings(): void
  startRebinding(actionId: ActionId): void
  /** The key pressed while an action waits; refused like `setBindings`. */
  rebindToChord(chord: string): string[]
  cancelRebinding(): void
  openSettings(): void
  closeSettings(): void
  /** "Leave it" or Escape on the cache's cards: no pick, the cache stays live. */
  closeArtefactChoice(): void
  /** Opens or closes the cards as the authority's answers say (`artefact_open`, `_chosen`). */
  followArtefactChoice(events: readonly DomainEvent[]): void
  moveFocus(step: -1 | 1): void
  activateFocusedControl(): void
  /** A screen button by id, as a click or `ui_confirm` presses it; a disabled one does nothing. */
  pressScreenButton(buttonId: string): boolean
  /** A player command from a key or a button; it ends any armed travel. */
  submitPlayerIntent(intent: CommandIntent): void
}

type SliceHost = PresentationValues &
  PresentationActions &
  ScreenSources & { vehicle: VehicleReplica }

type SetSlice = (partial: Partial<PresentationValues>) => void

export const STARTING_PRESENTATION: PresentationValues = {
  prefs: DEFAULT_PREFERENCES,
  bindings: defaultBindings(ACTION_MAP),
  bindingProblems: [],
  isSettingsOpen: false,
  isArtefactChoiceOpen: false,
  focusedControlId: null,
  isTravelArmed: false,
  rebindingActionId: null,
  renderScalePin: null,
}

export function inputLayerOf(state: SliceHost): InputContext {
  return topLayerOf(state.vehicle.mode, state)
}

export function presentationActionsOf(set: SetSlice, get: () => SliceHost): PresentationActions {
  const savePrefs = (prefs: Preferences) => {
    set({ prefs })
    writePreferences(prefs)
  }
  return {
    setPreference: (name, value) => {
      refuseProblems(preferenceProblems(name, value))
      savePrefs(withPreference(get().prefs, name, value))
    },
    setCameraMode: (mode) => get().setPreference('cameraMode', mode),
    togglePreference: (name) => get().setPreference(name, toggledValueOf(get().prefs, name)),
    setViewShortAxis: (metres) => {
      refuseProblems(viewShortAxisProblems(metres))
      savePrefs({ ...get().prefs, viewShortAxisMetres: metres as number })
    },
    zoom: (change) => get().setViewShortAxis(zoomedViewOf(get().prefs.viewShortAxisMetres, change)),
    pinRenderScale: (scale) => {
      refuseProblems(renderScalePinProblems(scale))
      set({ renderScalePin: scale as number | null })
    },
    adoptPreferences: ({ prefs, bindingsReset }) =>
      set({
        prefs,
        bindings: bindingsWithOverrides(ACTION_MAP, prefs.bindings).bindings,
        bindingProblems: bindingsReset,
      }),
    rememberSeenHints: (seenHints) => savePrefs({ ...get().prefs, seenHints }),
    setBindings: (overrides) => {
      const outcome = bindingsWithOverrides(ACTION_MAP, overrides)
      set({ bindingProblems: outcome.problems })
      if (outcome.problems.length > 0) return outcome.problems
      set({ bindings: outcome.bindings })
      savePrefs({ ...get().prefs, bindings: overrides as BindingOverrides })
      return []
    },
    resetBindings: () => void get().setBindings({}),
    startRebinding: (actionId) => set({ rebindingActionId: actionId }),
    rebindToChord: (chord) => {
      const actionId = get().rebindingActionId
      set({ rebindingActionId: null })
      if (actionId === null) return []
      return get().setBindings({ ...get().prefs.bindings, [actionId]: { keyboard: [chord] } })
    },
    cancelRebinding: () => set({ rebindingActionId: null }),
    openSettings: () => set({ isSettingsOpen: true, focusedControlId: null, isTravelArmed: false }),
    closeSettings: () =>
      set({ isSettingsOpen: false, focusedControlId: null, rebindingActionId: null }),
    closeArtefactChoice: () => set({ isArtefactChoiceOpen: false, focusedControlId: null }),
    followArtefactChoice: (events) => {
      const isOpen = isChoiceOpenAfter(events, get().playerId, get().isArtefactChoiceOpen)
      if (isOpen !== get().isArtefactChoiceOpen) {
        set({ isArtefactChoiceOpen: isOpen, focusedControlId: null })
      }
    },
    moveFocus: (step) => set({ focusedControlId: movedFocus(get(), step) }),
    activateFocusedControl: () => void get().pressScreenButton(focusedControlOf(get())),
    pressScreenButton: (buttonId) => {
      const button = menuButtonOf(get(), buttonId)
      if (button === null || button.reason !== null) return false
      set({ focusedControlId: buttonId, isTravelArmed: button.action.kind === 'armTravel' })
      runButtonAction(get(), button.action)
      return true
    },
    submitPlayerIntent: (intent) => {
      set({ isTravelArmed: false })
      submitCommand(get().playerId, intent)
    },
  }
}

function runButtonAction(state: SliceHost, action: ButtonAction): void {
  if (action.kind === 'submit') state.submitPlayerIntent(action.intent)
  else if (action.kind === 'openSettings') state.openSettings()
  else if (action.kind === 'closeSettings') state.closeSettings()
  else if (action.kind === 'closeArtefactChoice') state.closeArtefactChoice()
  else if (action.kind === 'togglePreference') state.togglePreference(action.name)
  else if (action.kind === 'rebind') state.startRebinding(action.actionId)
  else if (action.kind === 'resetBindings') state.resetBindings()
}

function zoomedViewOf(viewShortAxisMetres: number, change: ZoomChange): number {
  if (change === 'in') return zoomedIn(viewShortAxisMetres)
  return change === 'out' ? zoomedOut(viewShortAxisMetres) : VIEW_SHORT_AXIS_DEFAULT_M
}

function toggledValueOf(prefs: Preferences, name: PreferenceName): unknown {
  if (name === 'cameraMode') return otherCameraMode(prefs.cameraMode)
  if (name === 'musicVolume') return nextMusicVolume(prefs.musicVolume)
  return !prefs[name]
}

function focusedControlOf(state: SliceHost): string {
  const menu = menuScreenOf(inputLayerOf(state), state)
  return focusOnScreen(menu.focusStops, state.focusedControlId, menu.startFocus)
}

function movedFocus(state: SliceHost, step: -1 | 1): string {
  const menu = menuScreenOf(inputLayerOf(state), state)
  return stepFocus(menu.focusStops, focusedControlOf(state), step)
}

function menuButtonOf(state: SliceHost, buttonId: string): ScreenButton | null {
  const menu = menuScreenOf(inputLayerOf(state), state)
  return menu.buttons.find((button) => button.id === buttonId) ?? null
}
