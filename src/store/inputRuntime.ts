/**
 * Input in, intent and commands out (#33 section 1). Keys arrive from the shell and become actions
 * through the bindings of the top layer; held actions make the vehicle intent the fixed step reads,
 * and a pressed action makes one reaction: an ordinary authority command or a UI step. Nothing
 * here writes energy, cargo, money or tiles. The debug `input.*` namespace presses and releases
 * actions here, so a scripted tap travels the same path as a real key.
 *
 * Which keys pressed which actions is remembered per key, so a key released after the layer
 * changed (docking with D held) still releases what it pressed and nothing sticks. A pressed
 * action coming up sends what a slice's release reaction gives (ticket 332: a hold-to-use slot's
 * `release_power_up`), on any layer, and records its up edge only then; with no such reaction it
 * sends and records nothing, as before.
 *
 * A gamepad (ticket 346) takes the same path under its own codes: `padRuntime` turns each polled
 * frame into pad changes, and a pad change presses through the pad bindings exactly as a key does
 * through the keys, so rebinding, Start cancelling a capture and the any-layer release hold alike.
 */
import type { KeyChange, ScrollNotch } from '../shell/shell'
import { ACTION_MAP, actionDefOf, actionsOfChord, type ActionId } from '../systems/input/actionMap'
import { buildIntent } from '../systems/input/buildIntent'
import {
  reactionToPress,
  type InputReaction,
  type InputSituation,
} from '../systems/input/inputRouting'
import { chordOf } from '../systems/input/keyCodes'
import { padChordOf } from '../systems/input/padCodes'
import { sliceIntentOfRelease } from '../systems/registries/inputReactions'
import { canOpenArtefactCache } from '../systems/authority/artefactRules'
import { dockableBayOf, dockedBayOf } from '../systems/authority/dockRules'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { plantRefusal } from '../systems/authority/charges/chargeRules'
import { chargeSizeToPlantOf, nextChargeSizeOf } from '../systems/vehicle/chargeSelection'
import { mountedGunModeOf } from '../systems/vehicle/vehicleGun'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'
import { inputLayerOf } from './presentationSlice'

const CANCEL_REBINDING_KEY = 'Escape'
const CANCEL_REBINDING_PAD_CODE = 'PadStart'

const heldActions: ActionId[] = []
const actionsOfKey = new Map<string, ActionId[]>()
/** Every key and pad code down now, whatever layer it pressed in: a held drive counts on a dock screen. */
const keysDown = new Set<string>()
/** The vehicle's held drive actions (#170: holding one leaves the Workshop showcase). */
const DRIVE_ACTIONS: readonly ActionId[] = ['aim_left', 'aim_right', 'aim_down', 'lift']

/** One pad input going down or up, with whether the pad modifier (LB) was held as it went. */
export interface PadChange {
  code: string
  isDown: boolean
  isModifierHeld: boolean
}

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
 * Any key also takes a shown transmission down (#16), hides the touch controls until the next
 * touch (#173) and starts a scenario waiting for play (ticket 301), and still does what it is
 * bound to.
 */
export function routeKeyChange(key: KeyChange): void {
  rememberCode(key.code, key.isDown)
  if (!key.isDown) return releaseKey(key.code)
  noticePlayFromDevice()
  if (useGameStore.getState().rebindingActionId !== null) return captureRebinding(key)
  if (key.isRepeat) return
  pressKey(key.code, actionsOfKeyNow(key))
}

/** One pad input from `padRuntime`, as a key: a rebinding capture, or the actions its chord has. */
export function routePadChange(pad: PadChange): void {
  rememberCode(pad.code, pad.isDown)
  if (!pad.isDown) return releaseKey(pad.code)
  noticePlayFromDevice()
  if (useGameStore.getState().rebindingActionId !== null) return capturePadRebinding(pad)
  pressKey(pad.code, actionsOfPadNow(pad))
}

/** The wheel zooms like `zoom_in`/`zoom_out` (#39), so it does nothing on a menu layer. */
export function routeScrollNotch(notch: ScrollNotch): void {
  pressAction(notch === 'up' ? 'zoom_in' : 'zoom_out')
}

/**
 * An action goes down: a held one joins the intent, a pressed one reacts once. A touch or a
 * scripted press is play too, so it starts a scenario waiting for play, as a key does.
 */
export function pressAction(action: ActionId): void {
  const game = useGameStore.getState()
  if (!actionDefOf(ACTION_MAP, action).contexts.includes(inputLayerOf(game))) return
  game.releaseHoldUntilPlay()
  recordEdge(action, true)
  if (actionDefOf(ACTION_MAP, action).kind === 'hold') return holdAction(action)
  applyReaction(reactionToPress(action, situationNow()))
}

/** An action comes up: a held one leaves the intent, a pressed one sends its release, if any. */
export function releaseAction(action: ActionId): void {
  if (actionDefOf(ACTION_MAP, action).kind === 'hold') return letGoOfAction(action)
  sendReleaseOf(action)
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
  const { bindings, padBindings } = useGameStore.getState()
  return DRIVE_ACTIONS.some((action) =>
    [...bindings[action], ...padBindings[action]].some((chord) => keysDown.has(chord)),
  )
}

/** Nothing held; tests and a fresh store start here. */
export function resetInput(): void {
  heldActions.length = 0
  actionsOfKey.clear()
  actionStream.length = 0
  keysDown.clear()
}

function rememberCode(code: string, isDown: boolean): void {
  if (isDown) keysDown.add(code)
  else keysDown.delete(code)
}

/** Any key or pad press takes a transmission down, hides the touch controls and starts play. */
function noticePlayFromDevice(): void {
  useGameStore.getState().releaseHoldUntilPlay()
  useGameStore.getState().dismissTransmission()
  useGameStore.getState().hideTouchControls()
}

function holdAction(action: ActionId): void {
  const index = heldActions.indexOf(action)
  if (index >= 0) heldActions.splice(index, 1)
  heldActions.push(action)
}

function letGoOfAction(action: ActionId): void {
  const index = heldActions.indexOf(action)
  if (index < 0) return
  heldActions.splice(index, 1)
  recordEdge(action, false)
}

function sendReleaseOf(action: ActionId): void {
  const intent = sliceIntentOfRelease(action, situationNow())
  if (intent === null) return
  recordEdge(action, false)
  useGameStore.getState().submitPlayerIntent(intent)
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

/** The LB chord when bound, else the plain code, as `actionsOfKeyNow` does for Shift. */
function actionsOfPadNow(pad: PadChange): ActionId[] {
  const game = useGameStore.getState()
  const layer = inputLayerOf(game)
  const chord = padChordOf(pad.code, pad.isModifierHeld)
  const chorded = actionsOfChord(ACTION_MAP, game.padBindings, layer, chord)
  return chorded.length > 0
    ? chorded
    : actionsOfChord(ACTION_MAP, game.padBindings, layer, pad.code)
}

function captureRebinding(key: KeyChange): void {
  const game = useGameStore.getState()
  if (key.code === CANCEL_REBINDING_KEY) return game.cancelRebinding()
  game.rebindToChord(chordOf(key.code, key.isShiftHeld))
}

function capturePadRebinding(pad: PadChange): void {
  const game = useGameStore.getState()
  if (pad.code === CANCEL_REBINDING_PAD_CODE) return game.cancelRebinding()
  game.rebindToPadChord(padChordOf(pad.code, pad.isModifierHeld))
}

function situationNow(): InputSituation {
  const game = useGameStore.getState()
  const state = readAuthorityState()
  const { charges } = state.players[game.playerId].vehicle
  const sizeToPlant = chargeSizeToPlantOf(charges, game.chosenChargeSize)
  return {
    layer: inputLayerOf(game),
    vehicleMode: game.vehicle.mode,
    dockableBay: dockableBayOf(state, game.playerId),
    dockedBay: dockedBayOf(state, game.playerId),
    canOpenArtefactCache: canOpenArtefactCache(state, game.playerId),
    gunMode: mountedGunModeOf(state.players[game.playerId].vehicle.gun),
    plantableChargeSize:
      plantRefusal(state, game.playerId, sizeToPlant) === null ? sizeToPlant : null,
    nextChargeSize: nextChargeSizeOf(charges, game.chosenChargeSize),
    state,
    playerId: game.playerId,
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
  else if (reaction.kind === 'chooseChargeSize') game.chooseChargeSize(reaction.size)
}
