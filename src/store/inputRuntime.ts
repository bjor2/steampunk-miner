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
import { canOpenArtefactCache } from '../systems/authority/artefactRules'
import { dockableBayOf, dockedBayOf } from '../systems/authority/dockRules'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { plantRefusal } from '../systems/authority/charges/chargeRules'
import { mountedGunModeOf } from '../systems/vehicle/vehicleGun'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'
import { inputLayerOf } from './presentationSlice'

const CANCEL_REBINDING_KEY = 'Escape'

const heldActions: ActionId[] = []
const actionsOfKey = new Map<string, ActionId[]>()
/** Every key down now, whatever layer it pressed in: a drive key held on a dock screen counts. */
const keysDown = new Set<string>()
/** The vehicle's held drive actions (#170: holding one leaves the Workshop showcase). */
const DRIVE_ACTIONS: readonly ActionId[] = ['aim_left', 'aim_right', 'aim_down', 'lift']

/** One action going down (accepted in its layer) or a held one coming up, in order (#173). */
export interface ActionEdge {
  actionId: ActionId
  isDown: boolean
}

/** The newest edges kept for the debug read; enough for a scripted touch or key run. */
const KEPT_ACTION_EDGES = 256
const actionStream: ActionEdge[] = []

/**
 * One key from the shell: a rebinding capture, or the actions its chord has in the top layer.
 * Any key also takes a shown transmission down (#16) and hides the touch controls until the next
 * touch (#173), and still does what it is bound to.
 */
export function routeKeyChange(key: KeyChange): void {
  rememberKey(key)
  if (!key.isDown) return releaseKey(key.code)
  useGameStore.getState().dismissTransmission()
  useGameStore.getState().hideTouchControls()
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
  recordEdge(action, true)
  if (actionDefOf(ACTION_MAP, action).kind === 'hold') return holdAction(action)
  applyReaction(reactionToPress(action, situationNow()))
}

export function releaseAction(action: ActionId): void {
  const index = heldActions.indexOf(action)
  if (index < 0) return
  heldActions.splice(index, 1)
  recordEdge(action, false)
}

/**
 * The actions keys, touches and the debug API pressed, oldest first: the same play gives the same
 * stream whatever device it came from (#173 acceptance: touch and keyboard action streams match).
 */
export function readActionStream(): readonly ActionEdge[] {
  return actionStream
}

/** What the fixed step drives with: idle whenever a menu layer is on top. */
export function readVehicleIntent(): VehicleIntent {
  if (inputLayerOf(useGameStore.getState()) !== 'vehicle') return IDLE_INTENT
  return buildIntent(heldActions)
}

/** Whether a key bound to a drive action is down, on any layer (the Workshop's leave, #170). */
export function isDriveKeyHeld(): boolean {
  const { bindings } = useGameStore.getState()
  return DRIVE_ACTIONS.some((action) => bindings[action].some((chord) => keysDown.has(chord)))
}

/** Nothing held; tests and a fresh store start here. */
export function resetInput(): void {
  heldActions.length = 0
  actionsOfKey.clear()
  actionStream.length = 0
  keysDown.clear()
}

function rememberKey(key: KeyChange): void {
  if (key.isDown) keysDown.add(key.code)
  else keysDown.delete(key.code)
}

function holdAction(action: ActionId): void {
  const index = heldActions.indexOf(action)
  if (index >= 0) heldActions.splice(index, 1)
  heldActions.push(action)
}

function recordEdge(actionId: ActionId, isDown: boolean): void {
  actionStream.push({ actionId, isDown })
  if (actionStream.length > KEPT_ACTION_EDGES) actionStream.shift()
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
  const state = readAuthorityState()
  return {
    layer: inputLayerOf(game),
    vehicleMode: game.vehicle.mode,
    dockableBay: dockableBayOf(state, game.playerId),
    dockedBay: dockedBayOf(state, game.playerId),
    canOpenArtefactCache: canOpenArtefactCache(state, game.playerId),
    gunMode: mountedGunModeOf(state.players[game.playerId].vehicle.gun),
    canPlantCharge: plantRefusal(state, game.playerId) === null,
  }
}

function applyReaction(reaction: InputReaction): void {
  const game = useGameStore.getState()
  if (reaction.kind === 'submit') game.submitPlayerIntent(reaction.intent)
  else if (reaction.kind === 'openSettings') game.openSettings()
  else if (reaction.kind === 'closeSettings') game.closeSettings()
  else if (reaction.kind === 'closeArtefactChoice') game.closeArtefactChoice()
  else if (reaction.kind === 'dismissScreen') game.dismissScreen()
  else if (reaction.kind === 'moveFocus') game.moveFocus(reaction.step)
  else if (reaction.kind === 'activateFocused') game.activateFocusedControl()
  else if (reaction.kind === 'zoom') game.zoom(reaction.change)
}
