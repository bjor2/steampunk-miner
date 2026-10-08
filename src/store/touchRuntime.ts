/**
 * Touch in, actions out (#173): the floating stick, the cluster's buttons, the power-up slot
 * buttons (#217; a hold-to-use item's held from finger-down to lift, ticket 332), a pinch and a
 * double tap press actions through `pressAction` and
 * `releaseAction`, the path the keys take, so a touch run submits exactly the commands of the
 * matching key run and replays alike. Which pointer does what lives here, in module state, never
 * in React or the store; the stick's drawing reads it.
 */
import type { ActionId } from '../systems/input/actionMap'
import {
  heldChangesOf,
  isDoubleTap,
  isSlotHeldForCard,
  pinchZoomStepsOf,
  stickActionsOf,
  type SlotTileActionId,
  type StickOffset,
  type TapPoint,
} from '../systems/input/touchControls'
import { pressAction, releaseAction } from './inputRuntime'

/** Where the stick landed and how far the thumb has pushed it, for the stick's drawing. */
export interface StickPresence {
  pointerId: number | null
  originX: number
  originY: number
  offset: StickOffset
}

export const stickPresence: StickPresence = {
  pointerId: null,
  originX: 0,
  originY: 0,
  offset: { dx: 0, dy: 0 },
}

let stickHeld: ActionId[] = []
const pinchPoints = new Map<number, { x: number; y: number }>()
let pinchStartDistance = 0
let pinchStepsTaken = 0
let lastTap: TapPoint | null = null
/** When each slot button now under a finger went down, in ms. */
const slotPressedAtMs = new Map<SlotTileActionId, number>()
/** The tiles of items used by holding them that a finger is down on now (ticket 332). */
const heldSlotTiles = new Set<SlotTileActionId>()

/** A thumb lands in the stick zone: the stick appears under it, holding nothing yet. */
export function landStick(pointerId: number, x: number, y: number): void {
  if (stickPresence.pointerId !== null) return
  placeStick(pointerId, x, y)
}

/** The thumb moves: the held move actions follow the stick's direction. */
export function pushStick(pointerId: number, x: number, y: number): void {
  if (stickPresence.pointerId !== pointerId) return
  stickPresence.offset.dx = x - stickPresence.originX
  stickPresence.offset.dy = y - stickPresence.originY
  holdOnly(stickActionsOf(stickPresence.offset))
}

/** The thumb lifts: every move action it held is released that same moment. */
export function liftStick(pointerId: number): void {
  if (stickPresence.pointerId !== pointerId) return
  holdOnly([])
  placeStick(null, stickPresence.originX, stickPresence.originY)
}

/** A cluster button goes down: its action is pressed, as its key would press it. */
export function pressTouchButton(action: ActionId): void {
  pressAction(action)
}

export function releaseTouchButton(action: ActionId): void {
  releaseAction(action)
}

/**
 * A finger lands on a power-up slot button (#217) or a drill socket's tile (#244): nothing fires
 * yet, as a hold opens the slot's item card instead. The slice's panel passes the pointer event's
 * time.
 */
export function pressSlotButton(action: SlotTileActionId, atMs: number): void {
  slotPressedAtMs.set(action, atMs)
}

/**
 * A finger lands on the tile of an item used by holding it (ticket 332, the GD call on #285): the
 * slot is pressed at once, as its key goes down, and the lift or a slide-off releases it however
 * long the finger was down. The slice's panel decides whether the item card may still open.
 */
export function holdSlotButton(action: SlotTileActionId): void {
  heldSlotTiles.add(action)
  pressAction(action)
}

/**
 * The finger lifts: a held tile releases its slot; a tap uses the slot as its digit key would;
 * after a hold of a tap tile nothing fires.
 */
export function releaseSlotButton(action: SlotTileActionId, atMs: number): void {
  if (heldSlotTiles.has(action)) return letGoOfHeldSlot(action)
  tapSlotUnlessHeldForCard(action, atMs)
}

/** The finger slid off or the browser took the touch: a tap press ends with no use, a held one releases. */
export function cancelSlotButton(action: SlotTileActionId): void {
  slotPressedAtMs.delete(action)
  letGoOfHeldSlot(action)
}

/** Whether the slot's button has been held long enough to show its item card (#164). */
export function isSlotCardShown(action: SlotTileActionId, nowMs: number): boolean {
  const pressedAtMs = slotPressedAtMs.get(action)
  return pressedAtMs !== undefined && isSlotHeldForCard(pressedAtMs, nowMs)
}

/** A finger on the open screen: the second of a double tap resets the zoom, a second finger pinches. */
export function touchScreen(pointerId: number, tap: TapPoint): void {
  pinchPoints.set(pointerId, { x: tap.x, y: tap.y })
  if (pinchPoints.size === 2) startPinch()
  else if (isDoubleTap(lastTap, tap)) tapAction('zoom_reset')
  lastTap = pinchPoints.size === 1 ? tap : null
}

export function moveOnScreen(pointerId: number, x: number, y: number): void {
  if (!pinchPoints.has(pointerId)) return
  pinchPoints.set(pointerId, { x, y })
  if (pinchPoints.size === 2) stepPinchZoom()
}

export function leaveScreen(pointerId: number): void {
  pinchPoints.delete(pointerId)
}

/** Nothing held, no stick, no pinch; specs and a fresh store start here. */
export function resetTouch(): void {
  stickHeld = []
  pinchPoints.clear()
  lastTap = null
  slotPressedAtMs.clear()
  heldSlotTiles.clear()
  placeStick(null, 0, 0)
}

function tapSlotUnlessHeldForCard(action: SlotTileActionId, atMs: number): void {
  const pressedAtMs = slotPressedAtMs.get(action)
  slotPressedAtMs.delete(action)
  if (pressedAtMs === undefined || isSlotHeldForCard(pressedAtMs, atMs)) return
  tapAction(action)
}

/** Only once: the pointer leaving after the lift finds the tile already let go. */
function letGoOfHeldSlot(action: SlotTileActionId): void {
  if (!heldSlotTiles.delete(action)) return
  releaseAction(action)
}

/** The stick under a thumb (or none), centred where it landed. */
function placeStick(pointerId: number | null, x: number, y: number): void {
  stickPresence.pointerId = pointerId
  stickPresence.originX = x
  stickPresence.originY = y
  stickPresence.offset.dx = 0
  stickPresence.offset.dy = 0
}

function holdOnly(next: readonly ActionId[]): void {
  const { released, pressed } = heldChangesOf(stickHeld, next)
  released.forEach(releaseAction)
  pressed.forEach(pressAction)
  stickHeld = [...next]
}

function startPinch(): void {
  pinchStartDistance = pinchDistance()
  pinchStepsTaken = 0
}

function stepPinchZoom(): void {
  const steps = pinchZoomStepsOf(pinchStartDistance, pinchDistance())
  for (; pinchStepsTaken < steps; pinchStepsTaken++) tapAction('zoom_in')
  for (; pinchStepsTaken > steps; pinchStepsTaken--) tapAction('zoom_out')
}

function pinchDistance(): number {
  const [first, second] = [...pinchPoints.values()]
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function tapAction(action: ActionId): void {
  pressAction(action)
  releaseAction(action)
}
