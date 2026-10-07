/**
 * Planting a blasting charge (spec #109 design and numbers, built by #95; sizes K8 #218):
 *
 * - `PlantCharge {size}`: an active vehicle with a charge of that size in its rack and none live
 *   plants one on the wall its last reported pose faces (the drill's nose tile). A fused size blows
 *   its size's `fuseTicks` later on the authority's clock (`chargeDetonation.ts`); a remote one
 *   (sizes 7 to 10) waits for the plunger (#149) and is disarmed if nobody fires it
 *   (`chargeDisarm.ts`). A size not open on this planet is refused `size_locked`, one the rack does
 *   not hold `no_charge_of_size`. Logs `charge_planted`, or `remote_charge_planted`.
 * - `debug.setCharges`: a scenario's mounted rack, its slots and the charges of one size in it, no
 *   price.
 *
 * The Upgrade bay's charge commands are in `chargeShopRules.ts`. A refused command changes nothing.
 */
import { rackCapacity, rackMaxSlotLevel } from '../../economy/blastingCharges'
import {
  chargeSizeCount,
  fuseTicksOf,
  isChargeSize,
  isSizeLockedOn,
  rackSlotsOf,
} from '../../economy/chargeSizes'
import {
  carriedOf,
  totalCarriedOf,
  withCarried,
  type PlantedCharge,
  type VehicleCharges,
} from '../../vehicle/vehicleCharges'
import { noseTileOf, type VehiclePose } from '../../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import type { TilePoint } from '../../world/tileGrid'
import { isSolidCell } from '../../world/worldCell'
import { materialCellAt } from '../../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { noPlanetRejection, planetParamsOf } from '../planetOfState'

/** What `debug.setCharges` asks for: the rack's bought slots and the charges of one size in it. */
interface DebugRack {
  size: number
  carried: number
  slotLevel: number
}

export const CHARGE_RULES: {
  readonly plantCharge: CommandRule<'plantCharge'>
} = {
  plantCharge: {
    fields: { size: 'wholeNumber' },
    reject: (state, { playerId, payload }) => plantRefusal(state, playerId, payload.size),
    apply: (state, { playerId, tick, payload }) => plantCharge(state, playerId, payload.size, tick),
  },
}

export const CHARGE_DEBUG_RULES: {
  readonly 'debug.setCharges': CommandRule<'debug.setCharges'>
} = {
  'debug.setCharges': {
    fields: { size: 'wholeNumber', carried: 'wholeNumber', slotLevel: 'wholeNumber' },
    reject: (_state, { payload }) => debugRackRejection(payload),
    apply: (state, { playerId, payload }) => ({
      state: withCharges(state, playerId, debugRackOf(chargesOf(state, playerId), payload)),
      events: [],
    }),
  },
}

/** Why planting a charge of `size` would be refused now; null when it would plant. */
export function plantRefusal(
  state: AuthorityState,
  playerId: string,
  size: number,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => activeVehicleRejection(vehicle),
    () => unknownSizeRejection(size),
    () => lockedSizeRejection(size, state.planet.index),
    () => noChargeOfSizeRejection(vehicle.charges, size),
    () => liveChargeRejection(vehicle.charges),
    () => noWallRejection(state, vehicle.pose),
  ])
}

/** Every vehicle's live charge, its own or another player's, in player order. */
export function liveChargesOf(state: AuthorityState): PlantedCharge[] {
  return Object.values(state.players)
    .map((player) => player.vehicle.charges.planted)
    .filter((planted): planted is PlantedCharge => planted !== null)
}

export function chargesOf(state: AuthorityState, playerId: string): VehicleCharges {
  return vehicleOf(state, playerId).charges
}

export function withCharges(
  state: AuthorityState,
  playerId: string,
  charges: VehicleCharges,
): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), charges })
}

/** A charge size off the ladder is no size at all; the lists say which sizes exist. */
export function unknownSizeRejection(size: number): Rejection | null {
  if (isChargeSize(size)) return null
  return rejectionOf('out_of_range', `size must be 1 to ${chargeSizeCount()}, got ${size}`)
}

export function lockedSizeRejection(size: number, planetIndex: number): Rejection | null {
  if (!isSizeLockedOn(size, planetIndex)) return null
  return rejectionOf('size_locked', `charge size ${size} is not open on planet ${planetIndex}`)
}

function activeVehicleRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle)) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode}`)
}

function noChargeOfSizeRejection(charges: VehicleCharges, size: number): Rejection | null {
  if (carriedOf(charges, size) > 0) return null
  return rejectionOf('no_charge_of_size', `the rack holds no size-${size} charge`)
}

function liveChargeRejection(charges: VehicleCharges): Rejection | null {
  if (charges.planted === null) return null
  return rejectionOf('charge_live', 'one charge is already planted')
}

function noWallRejection(state: AuthorityState, pose: VehiclePose | null): Rejection | null {
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return rejectionOf('no_wall', 'the vehicle has no pose')
  const wall = noseTileOf(pose)
  if (isSolidCell(materialCellAt(state.world, params, wall))) return null
  return rejectionOf('no_wall', `tile ${wall.tx},${wall.ty} is not a wall`)
}

/** A debug rack: a slot level the rack has, a size on the ladder, and no more than fit. */
function debugRackRejection(rack: DebugRack): Rejection | null {
  return firstRejection([
    () => slotLevelRejection(rack.slotLevel),
    () => unknownSizeRejection(rack.size),
    () => overfullRackRejection(rack),
  ])
}

function slotLevelRejection(slotLevel: number): Rejection | null {
  if (slotLevel <= rackMaxSlotLevel()) return null
  return rejectionOf('out_of_range', `slotLevel must be 0 to ${rackMaxSlotLevel()}`)
}

function overfullRackRejection(rack: DebugRack): Rejection | null {
  const fitting = Math.floor(rackCapacity(rack.slotLevel) / rackSlotsOf(rack.size))
  if (rack.carried <= fitting) return null
  return rejectionOf('out_of_range', `carried must be 0 to ${fitting} of size ${rack.size}`)
}

function debugRackOf(charges: VehicleCharges, rack: DebugRack): VehicleCharges {
  const mounted = { ...charges, isRackMounted: true, slotLevel: rack.slotLevel, carriedBySize: {} }
  return withCarried(mounted, rack.size, rack.carried)
}

function plantCharge(
  state: AuthorityState,
  playerId: string,
  size: number,
  tick: number,
): RuleEffect {
  const { charges, pose } = vehicleOf(state, playerId)
  const planted = plantedChargeOf(noseTileOf(pose as VehiclePose), size, tick)
  const rack = withCarried(charges, size, carriedOf(charges, size) - 1)
  const { tx, ty, detonateTick } = planted
  return {
    state: withCharges(state, playerId, { ...rack, planted }),
    events: [{ type: 'ChargePlanted', tx, ty, size, detonateTick, carried: totalCarriedOf(rack) }],
  }
}

function plantedChargeOf(wall: TilePoint, size: number, tick: number): PlantedCharge {
  const fuseTicks = fuseTicksOf(size)
  const detonateTick = fuseTicks === null ? null : tick + fuseTicks
  return { tx: wall.tx, ty: wall.ty, size, plantedTick: tick, detonateTick }
}
