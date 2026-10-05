/**
 * Input in, intent and commands out (#33 section 1). Keys arrive from the shell and become actions
 * through the bindings of the top layer; held actions make the vehicle intent the fixed step reads,
 * and a pressed action makes one reaction: an ordinary authority command or a UI step. Nothing
 * here writes energy, cargo, money or tiles. The debug `input.*` namespace presses and releases
 * actions here, so a scripted tap travels the same path as a real key.
 *
 * Which keys pressed which actions is remembered per key, so a key released after the layer
 * changed (docking with D held) still releases what it pressed and nothing sticks.
 */
import type { KeyChange, ScrollNotch } from '../shell/shell'
import { ACTION_MAP, actionDefOf, actionsOfChord, type ActionId } from '../systems/input/actionMap'
import { buildIntent } from '../systems/input/buildIntent'
import { reactionToPress, type InputReaction } from '../systems/input/inputRouting'
import { chordOf } from '../systems/input/keyCodes'
import { canDock } from '../systems/authority/dockRules'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'
import { inputLayerOf } from './presentationSlice'

const CANCEL_REBINDING_KEY = 'Escape'

const heldActions: ActionId[] = []
const actionsOfKey = new Map<string, ActionId[]>()

/**
 * One key from the shell: a rebinding capture, or the actions its chord has in the top layer.
 * Any key also takes a shown transmission down (#16), and still does what it is bound to.
 */
export function routeKeyChange(key: KeyChange): void {
  if (!key.isDown) return releaseKey(key.code)
  useGameStore.getState().dismissTransmission()
  if (useGameStore.getState().rebindingActionId !== null) return captureRebinding(key)
  if (key.isRepeat) return
  pressKey(key.code, actionsOfKeyNow(key))
}

/** The wheel zooms like `zoom_in`/`zoom_out` (#39), so it does nothing on a menu layer. */
export function routeScrollNotch(notch: ScrollNotch): void {
  pressAction(notch === 'up' ? 'zoom_in' : 'zoom_out')
}

/** An action goes down: a held one joins the intent, a pressed one reacts once. */
export function pressAction(action: ActionId): void {
  const game = useGameStore.getState()
  if (!actionDefOf(ACTION_MAP, action).contexts.includes(inputLayerOf(game))) return
  if (actionDefOf(ACTION_MAP, action).kind === 'hold') return holdAction(action)
  applyReaction(reactionToPress(action, situationNow()))
}

export function releaseAction(action: ActionId): void {
  const index = heldActions.indexOf(action)
  if (index >= 0) heldActions.splice(index, 1)
}

/** What the fixed step drives with: idle whenever a menu layer is on top. */
export function readVehicleIntent(): VehicleIntent {
  if (inputLayerOf(useGameStore.getState()) !== 'vehicle') return IDLE_INTENT
  return buildIntent(heldActions)
}

/** Nothing held; tests and a fresh store start here. */
export function resetInput(): void {
  heldActions.length = 0
  actionsOfKey.clear()
}

function holdAction(action: ActionId): void {
  releaseAction(action)
  heldActions.push(action)
}

function pressKey(code: string, actions: readonly ActionId[]): void {
  actionsOfKey.set(code, [...actions])
  actions.forEach(pressAction)
}

function releaseKey(code: string): void {
  const pressed = actionsOfKey.get(code) ?? []
  actionsOfKey.delete(code)
  pressed.forEach(releaseAction)
}

/** Shift+Tab when bound, else the plain key, so Shift never blocks a driving key. */
function actionsOfKeyNow(key: KeyChange): ActionId[] {
  const game = useGameStore.getState()
  const layer = inputLayerOf(game)
  const chorded = actionsOfChord(
    ACTION_MAP,
    game.bindings,
    layer,
    chordOf(key.code, key.isShiftHeld),
  )
  return chorded.length > 0 ? chorded : actionsOfChord(ACTION_MAP, game.bindings, layer, key.code)
}

function captureRebinding(key: KeyChange): void {
  const game = useGameStore.getState()
  if (key.code === CANCEL_REBINDING_KEY) return game.cancelRebinding()
  game.rebindToChord(chordOf(key.code, key.isShiftHeld))
}

function situationNow() {
  const game = useGameStore.getState()
  return {
    layer: inputLayerOf(game),
    vehicleMode: game.vehicle.mode,
    canDock: canDock(readAuthorityState(), game.playerId),
  }
}

function applyReaction(reaction: InputReaction): void {
  const game = useGameStore.getState()
  if (reaction.kind === 'submit') game.submitPlayerIntent(reaction.intent)
  else if (reaction.kind === 'openSettings') game.openSettings()
  else if (reaction.kind === 'closeSettings') game.closeSettings()
  else if (reaction.kind === 'moveFocus') game.moveFocus(reaction.step)
  else if (reaction.kind === 'jumpPanel') game.jumpFocusPanel(reaction.step)
  else if (reaction.kind === 'activateFocused') game.activateFocusedControl()
  else if (reaction.kind === 'zoom') game.zoom(reaction.change)
}
