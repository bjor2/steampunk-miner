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
 *
 * Which actions are down, and how many presses each had, is kept for the slices' frame loops
 * (ticket 345, the #314 TD lock section 2): the ground gun repeats its fire while its press is
 * held, and a press count catches a tap shorter than a frame. Release clears it on any layer, as
 * it sends a release, so a key let go after docking never leaves the gun firing.
 *
 * The analog sticks (ticket 791) drive past the actions: the touch stick and the pad's left stick
 * each hand their push here (`driveWithStick`), and while one pushes it is the intent itself, its
 * drive and aim analog; the four held move actions take over again once it rests.
 */
import type { KeyChange, ScrollNotch } from '../shell/shell'
import { ACTION_MAP, actionDefOf, actionsOfChord, type ActionId } from '../systems/input/actionMap'
import { intentOfStick, type StickDrive } from '../systems/input/analogStick'
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
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { plantRefusal } from '../systems/authority/charges/chargeRules'
import { chargeSizeToPlantOf, nextChargeSizeOf } from '../systems/vehicle/chargeSelection'
import { mountedGunModeOf } from '../systems/vehicle/vehicleGun'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'
import { inputLayerOf } from './presentationSlice'
import { toolActionsOnTurnedTray } from './toolPageKeys'

const CANCEL_REBINDING_KEY = 'Escape'
const CANCEL_REBINDING_PAD_CODE = 'PadStart'

const heldActions: ActionId[] = []
const actionsOfKey = new Map<string, ActionId[]>()
/** Every key and pad code down now, whatever layer it pressed in: a held drive counts on a dock screen. */
const keysDown = new Set<string>()
/** Every action pressed in its layer and not released since, on any layer (ticket 345). */
const actionsDown = new Set<ActionId>()
const pressCounts = new Map<ActionId, number>()
/** The vehicle's held drive actions (#170: holding one leaves the Workshop showcase). */
const DRIVE_ACTIONS: readonly ActionId[] = ['aim_left', 'aim_right', 'aim_down', 'lift']

/** The analog sticks that drive (ticket 791); the touch stick wins while both push. */
export type StickSource = 'touch' | 'pad'

const STICK_SOURCES: readonly StickSource[] = ['touch', 'pad']
/** Each analog stick's drive while it pushes; a source at rest has none. */
const stickDrives = new Map<StickSource, StickDrive>()

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
 * bound to. Answers whether the game took the key (ticket 768), a held key's repeats too, so the
 * shell keeps the browser's default of a key the game uses.
 */
export function routeKeyChange(key: KeyChange): boolean {
  rememberCode(key.code, key.isDown)
  if (!key.isDown) return releaseKey(key.code)
  noticePlayFromDevice()
  if (useGameStore.getState().rebindingActionId !== null) return captureRebinding(key)
  if (key.isRepeat) return actionsOfKeyNow(key).length > 0
  return pressKey(key.code, actionsOfKeyNow(key))
}

/** One pad input from `padRuntime`, as a key: a rebinding capture, or the actions its chord has. */
export function routePadChange(pad: PadChange): void {
  rememberCode(pad.code, pad.isDown)
  if (!pad.isDown) {
    releaseKey(pad.code)
    return
  }
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
  markActionDown(action)
  if (actionDefOf(ACTION_MAP, action).kind === 'hold') return holdAction(action)
  applyReaction(reactionToPress(action, situationNow()))
}

/** An action comes up: a held one leaves the intent, a pressed one sends its release, if any. */
export function releaseAction(action: ActionId): void {
  actionsDown.delete(action)
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

/** Whether the action is down now: pressed in its layer and not yet released (ticket 345). */
export function isActionDown(action: ActionId): boolean {
  return actionsDown.has(action)
}

/** How many times the action went down since input was reset; a reader keeps the count it saw. */
export function pressCountOf(action: ActionId): number {
  return pressCounts.get(action) ?? 0
}

/**
 * An analog stick's drive now, or null once it rests (ticket 791). A push that starts is play, so
 * it starts a scenario waiting for play, as a key does.
 */
export function driveWithStick(source: StickSource, drive: StickDrive | null): void {
  if (drive === null) {
    stickDrives.delete(source)
    return
  }
  if (!stickDrives.has(source)) useGameStore.getState().releaseHoldUntilPlay()
  stickDrives.set(source, drive)
}

/** The drive the stick pushes with now, or null while it rests; a push near its aim keeps it. */
export function readStickDrive(source: StickSource): Readonly<StickDrive> | null {
  return stickDrives.get(source) ?? null
}

/**
 * What the fixed step drives with: idle whenever a menu layer is on top, a pushing analog stick's
 * drive, else the held actions'.
 */
export function readVehicleIntent(): VehicleIntent {
  if (inputLayerOf(useGameStore.getState()) !== 'vehicle') return IDLE_INTENT
  const stick = pushingStickDrive()
  return stick === null ? buildIntent(heldActions) : intentOfStick(stick)
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
  actionsDown.clear()
  pressCounts.clear()
  stickDrives.clear()
}

function pushingStickDrive(): StickDrive | null {
  const source = STICK_SOURCES.find((stick) => stickDrives.has(stick))
  return source === undefined ? null : (stickDrives.get(source) ?? null)
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

function markActionDown(action: ActionId): void {
  actionsDown.add(action)
  pressCounts.set(action, pressCountOf(action) + 1)
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

/** Presses the key's actions; whether it had any. */
function pressKey(code: string, actions: readonly ActionId[]): boolean {
  actionsOfKey.set(code, [...actions])
  actions.forEach(pressAction)
  return actions.length > 0
}

/** Releases what the key pressed; a key coming up is never the game's to keep. */
function releaseKey(code: string): false {
  const pressed = actionsOfKey.get(code) ?? []
  actionsOfKey.delete(code)
  pressed.forEach(releaseAction)
  return false
}

/** A number key on a turned tool tray presses its cell's tool; any other key its binding. */
function actionsOfKeyNow(key: KeyChange): ActionId[] {
  return trayActionsOfKey(key) ?? boundActionsOfKey(key)
}

/** Only while driving, where the bar is drawn (ticket 768); null leaves the key to its binding. */
function trayActionsOfKey(key: KeyChange): ActionId[] | null {
  const isDriving = inputLayerOf(useGameStore.getState()) === 'vehicle'
  return isDriving ? toolActionsOnTurnedTray(key.code) : null
}

/** Shift+Tab when bound, else the plain key, so Shift never blocks a driving key. */
function boundActionsOfKey(key: KeyChange): ActionId[] {
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

/** The key becomes the binding, or Escape cancels; the game takes it either way. */
function captureRebinding(key: KeyChange): true {
  const game = useGameStore.getState()
  if (key.code === CANCEL_REBINDING_KEY) game.cancelRebinding()
  else game.rebindToChord(chordOf(key.code, key.isShiftHeld))
  return true
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
    isStarMapOpen: game.isStarMapOpen,
    state,
    playerId: game.playerId,
  }
}

function applyReaction(reaction: InputReaction): void {
  const game = useGameStore.getState()
  if (reaction.kind === 'submit') game.submitPlayerIntent(reaction.intent)
  else if (reaction.kind === 'openSettings') game.openSettings()
  else if (reaction.kind === 'openPauseMenu') game.openPauseMenu()
  else if (reaction.kind === 'stepBackInPauseMenu') game.stepBackInPauseMenu()
  else if (reaction.kind === 'closeSettings') game.closeSettings()
  else if (reaction.kind === 'closeArtefactChoice') game.closeArtefactChoice()
  else if (reaction.kind === 'dismissScreen') game.dismissScreen()
  else if (reaction.kind === 'closeSheet') game.closeSheet()
  else if (reaction.kind === 'moveFocus') game.moveFocus(reaction.step)
  else if (reaction.kind === 'activateFocused') game.activateFocusedControl()
  else if (reaction.kind === 'zoom') game.zoom(reaction.change)
  else if (reaction.kind === 'chooseChargeSize') game.chooseChargeSize(reaction.size)
  else if (reaction.kind === 'showTitlePage') game.showTitlePage(reaction.page)
  else if (reaction.kind === 'toggleSheet') game.toggleSheet()
  else if (reaction.kind === 'openSheetAtPlace') game.openSheetAtPlace(reaction.place)
  else if (reaction.kind === 'toggleStarMap') game.toggleStarMap()
  else if (reaction.kind === 'closeStarMap') game.closeStarMap()
  else if (reaction.kind === 'leaveStation') leaveStation(reaction.intent)
}

/** Everything open over the station shuts first, so the one Undock lands back on driving. */
function leaveStation(undock: CommandIntent): void {
  const game = useGameStore.getState()
  game.closeSheet()
  game.closeStarMap()
  game.submitPlayerIntent(undock)
}
