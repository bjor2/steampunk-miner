/**
 * Pendulum anchor (ticket 373, aetheric × mobility; Content's definition and the GD ruling of 14
 * Oct): when the grav anchor switches on and pins the vehicle in open air, the chronometric governor
 * is pressed on its own and opens its pocket round the pinned vehicle, at its own range, slow and
 * duration. It takes the governor's charge, energy per tick, heat and cooldown like any pocket,
 * through the press path a key takes (`pressItemOnAuto`), so it is refused for the same reasons
 * and logs `power_up_auto_fired` and `power_up_used`, beside `aetheric.pendulum_swung`. The anchor
 * itself, and the vehicle's motion, are unchanged (the #233 cap is untouched).
 *
 * Pinned in open air: the anchor clings only with a side on the ground (`isHeldAgainstGravity`), so
 * the vehicle hangs from the roof or a wall with no ground under it. The authority reads it from the
 * cells round the vehicle's tile: open below, solid above or to a side. A switch-on inside the #328
 * gap of the governor opens nothing.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import {
  FACING,
  noseTileOf,
  tileOfPose,
  type Facing,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { isSolidCell } from '../../../systems/world/worldCell'
import { cellAt, type WorldState } from '../../../systems/world/worldState'
import { pressItemOnAuto } from '../../power-up-core'
import { pendulumSwungOf } from './aethericEvents'
import { isComboInPlay, isPastPressGap, PENDULUM_ANCHOR_ID } from './aethericCombos'
import { GOVERNOR_ID } from './governorItem'

const GRAV_ANCHOR = 'power.grav_anchor'
/** Whatever the anchor clings to: the roof or either wall. */
const HOLDING_SIDES: readonly Facing[] = [FACING.up, FACING.left, FACING.right]

type PowerUpUsed = Extract<DomainEvent, { type: 'power-up-core.PowerUpUsed' }>

export const PENDULUM_ANCHOR_REACTION: AuthorityReaction = {
  id: 'aetheric.pendulum-anchor',
  react: (_before, after, heard) => swingOnPin(after, heard),
}

function swingOnPin(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const pin = heard.find(isAnchorSwitchedOn)
  if (pin === undefined || !isSwingReady(state, pin)) return unchanged(state)
  const tile = hangingTileOf(state, pin.playerId)
  if (tile === null) return unchanged(state)
  const pressed = pressItemOnAuto(state, pin.playerId, GOVERNOR_ID, pin.tick)
  if (pressed.state === state) return unchanged(state)
  const swung = pendulumSwungOf({ playerId: pin.playerId, itemId: PENDULUM_ANCHOR_ID, ...tile })
  return { state: pressed.state, events: [...pressed.events, swung] }
}

function isSwingReady(state: AuthorityState, pin: PowerUpUsed): boolean {
  return (
    isComboInPlay(state, pin.playerId, PENDULUM_ANCHOR_ID) &&
    isPastPressGap(state, pin.playerId, GOVERNOR_ID, pin.tick)
  )
}

/** The vehicle's tile while it hangs in open air; null on the ground or with nothing to hold. */
export function hangingTileOf(state: AuthorityState, playerId: string): TilePoint | null {
  const ground = groundReadOf(state, playerId)
  return ground !== null && isHangingInOpenAir(ground) ? tileOfPose(ground.pose) : null
}

interface GroundRead {
  world: WorldState
  params: PlanetParams
  pose: VehiclePose
}

function groundReadOf(state: AuthorityState, playerId: string): GroundRead | null {
  const pose = vehicleOf(state, playerId).pose
  const params = planetParamsOf(state.planet)
  return pose === null || params === null ? null : { world: state.world, params, pose }
}

/** No ground under the vehicle, and the roof or a wall for the anchor to cling to. */
function isHangingInOpenAir(ground: GroundRead): boolean {
  if (isSolidAlong(ground, FACING.down)) return false
  return HOLDING_SIDES.some((side) => isSolidAlong(ground, side))
}

/** The tile one along `facing` from the vehicle's centre is solid. */
function isSolidAlong({ world, params, pose }: GroundRead, facing: Facing): boolean {
  return isSolidCell(cellAt(world, params, noseTileOf({ ...pose, facing })))
}

function isAnchorSwitchedOn(event: DomainEvent): event is PowerUpUsed {
  return (
    event.type === 'power-up-core.PowerUpUsed' &&
    event.itemId === GRAV_ANCHOR &&
    event.toggledOn === true
  )
}
