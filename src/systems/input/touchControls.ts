/**
 * The touch controls as rules (#173, Gameplay & Vehicle's layout): which move actions a stick
 * push holds, which cluster buttons the situation shows, how many zoom steps a pinch has made and
 * what counts as a double tap. The controls only press existing actions, the same way the keys
 * do, so a touch run and a key run replay alike. Nothing here touches the DOM or the store.
 */
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  SLOT_CARD_HOLD_MS,
  STICK_DEADZONE_SHARE,
  STICK_OCTANT_SLOPE,
  STICK_RADIUS_PX,
} from '../../constants/touch'
import { ZOOM_STEP_FACTOR } from '../../constants/scene'
import {
  buttonIconIdOf,
  combatStatusIconIdOf,
  hudLabelIconIdOf,
  vehicleStateIconIdOf,
} from '../art/icons/iconSet'
import type { VehicleMode } from '../vehicle/vehicleState'
import type { BayId } from '../world/dockBays'
import type { ActionId, InputContext } from './actionMap'

/** The cluster's buttons in a fixed order; each presses the action of the same id. */
export const CLUSTER_ACTION_IDS = [
  'interact',
  'plant_charge',
  'toggle_guns',
  'request_rescue',
  'quick_service',
] as const satisfies readonly ActionId[]

export type ClusterActionId = (typeof CLUSTER_ACTION_IDS)[number]

/** The power-up slots' actions, slot 1 first (#162 section 3, #217). */
export const SLOT_ACTION_IDS = [
  'use_slot_1',
  'use_slot_2',
  'use_slot_3',
  'use_slot_4',
  'use_slot_5',
] as const satisfies readonly ActionId[]

export type SlotActionId = (typeof SLOT_ACTION_IDS)[number]

/** What decides which cluster buttons show, read from the store and the authority replica. */
export interface TouchSituation {
  layer: InputContext
  vehicleMode: VehicleMode
  dockedBay: BayId | null
  hasGuns: boolean
  hasChargeRack: boolean
}

/** A finger's offset from where the stick landed, in CSS px, y growing down the screen. */
export interface StickOffset {
  dx: number
  dy: number
}

type Vertical = 'lift' | 'aim_down' | null
type Horizontal = 'aim_left' | 'aim_right' | null

/**
 * The move actions a push holds, vertical first: up lifts, down drills down, left and right
 * drive, and a diagonal holds both, exactly the keys W, S, A and D held in that order.
 */
export function stickActionsOf(offset: StickOffset): ActionId[] {
  if (isInDeadzone(offset)) return []
  return [verticalOf(offset), horizontalOf(offset)].filter(
    (action): action is NonNullable<Vertical | Horizontal> => action !== null,
  )
}

/** The cluster buttons to show now, in the cluster's order (#173: only valid and owned ones). */
export function clusterActionsOf(situation: TouchSituation): ClusterActionId[] {
  return CLUSTER_ACTION_IDS.filter((action) => CLUSTER_RULES[action](situation))
}

/** Each cluster button's glyph, from the icon set the HUD already reads (#158; no text, #173). */
export function clusterIconIdOf(action: ClusterActionId): string {
  return CLUSTER_ICON_IDS[action]
}

/** Where the stick's knob is drawn: the push, held inside the 56 px travel. */
export function knobOffsetOf({ dx, dy }: StickOffset): StickOffset {
  const length = Math.hypot(dx, dy)
  if (length <= STICK_RADIUS_PX) return { dx, dy }
  return { dx: (dx * STICK_RADIUS_PX) / length, dy: (dy * STICK_RADIUS_PX) / length }
}

/** The floating stick is there to drive, so it shows only while the vehicle has the input. */
export function isStickShown(layer: InputContext): boolean {
  return layer === 'vehicle'
}

/**
 * Whole zoom steps a pinch has made since it began: fingers spread by 1.25 is one `zoom_in`,
 * pinched by 1.25 one `zoom_out` (negative), like the wheel's notches.
 */
export function pinchZoomStepsOf(startDistancePx: number, distancePx: number): number {
  if (startDistancePx <= 0 || distancePx <= 0) return 0
  return Math.trunc(Math.log(distancePx / startDistancePx) / Math.log(ZOOM_STEP_FACTOR))
}

/** A tap, as a double-tap check needs it: where, and when in ms. */
export interface TapPoint {
  x: number
  y: number
  atMs: number
}

/** The second of two taps within 300 ms and 24 px of each other. */
export function isDoubleTap(previous: TapPoint | null, tap: TapPoint): boolean {
  if (previous === null) return false
  const isSoon = tap.atMs - previous.atMs <= DOUBLE_TAP_MS
  return isSoon && Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_SLOP_PX
}

/**
 * A finger on a slot button for this long has opened the slot's item card (#164 draws it), so
 * lifting it uses nothing; a shorter press is a tap that uses the slot at once, with no confirm.
 */
export function isSlotHeldForCard(pressedAtMs: number, nowMs: number): boolean {
  return nowMs - pressedAtMs >= SLOT_CARD_HOLD_MS
}

/** What changes between two sets of held move actions: releases first, then presses. */
export function heldChangesOf(
  held: readonly ActionId[],
  next: readonly ActionId[],
): { released: ActionId[]; pressed: ActionId[] } {
  return {
    released: held.filter((action) => !next.includes(action)),
    pressed: next.filter((action) => !held.includes(action)),
  }
}

const CLUSTER_ICON_IDS: Readonly<Record<ClusterActionId, string>> = {
  interact: vehicleStateIconIdOf('docked'),
  plant_charge: hudLabelIconIdOf('charges'),
  toggle_guns: hudLabelIconIdOf('guns'),
  request_rescue: combatStatusIconIdOf('tow'),
  quick_service: buttonIconIdOf('quick_service'),
}

const CLUSTER_RULES: Readonly<Record<ClusterActionId, (situation: TouchSituation) => boolean>> = {
  interact: ({ layer }) => layer === 'vehicle',
  plant_charge: ({ layer, hasChargeRack }) => layer === 'vehicle' && hasChargeRack,
  toggle_guns: ({ layer, hasGuns }) => layer === 'vehicle' && hasGuns,
  request_rescue: ({ layer, vehicleMode }) => layer === 'vehicle' && isWaitingForTow(vehicleMode),
  quick_service: ({ layer, dockedBay }) => layer === 'platform' && dockedBay === 'sell',
}

/** The tow is called only for a vehicle that cannot move on its own (#7), as `R` is. */
function isWaitingForTow(mode: VehicleMode): boolean {
  return mode === 'stranded' || mode === 'destroyed'
}

function isInDeadzone({ dx, dy }: StickOffset): boolean {
  return Math.hypot(dx, dy) < STICK_RADIUS_PX * STICK_DEADZONE_SHARE
}

function verticalOf({ dx, dy }: StickOffset): Vertical {
  if (Math.abs(dy) <= Math.abs(dx) * STICK_OCTANT_SLOPE) return null
  return dy < 0 ? 'lift' : 'aim_down'
}

function horizontalOf({ dx, dy }: StickOffset): Horizontal {
  if (Math.abs(dx) <= Math.abs(dy) * STICK_OCTANT_SLOPE) return null
  return dx < 0 ? 'aim_left' : 'aim_right'
}
