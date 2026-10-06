/**
 * The blasting charge commands (spec #109 design and numbers, built by #95):
 *
 * - `PlantCharge`: an active vehicle with a charge in its rack and none live plants one on the
 *   wall its last reported pose faces (the drill's nose tile); its fuse blows `fuseTicks` later on
 *   the authority's clock (`chargeDetonation.ts`). Logs `charge_planted`.
 * - `RestockCharges`: at the Upgrade bay only, once `blasting_charges` is open (planet 7, #80),
 *   fills the rack's empty slots at the price per charge; the first buy bolts the rack on. Logs
 *   `charges_restocked`.
 * - `BuyChargeRackSlot`: at the Upgrade bay, once open, one more slot, up to the last. Logs
 *   `charge_rack_upgraded`.
 * - `debug.setCharges`: a scenario's mounted rack, its slots and the charges in it, no price.
 *
 * A charge the wallet cannot pay is refused with `money_short`, never trimmed (#8). A refused
 * command changes nothing.
 */
import { BLASTING_CHARGES_ROW_ID } from '../../art/artIds'
import {
  chargeFuseTicks,
  rackCapacity,
  rackMaxSlotLevel,
  rackSlotPrice,
  restockPrice,
} from '../../economy/blastingCharges'
import { sub, toCanonical, type Money } from '../../money'
import { emptyRackSlotsOf, rackCapacityOf, type VehicleCharges } from '../../vehicle/vehicleCharges'
import { noseTileOf, type VehiclePose } from '../../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import { isSolidCell } from '../../world/worldCell'
import { materialCellAt } from '../../world/worldState'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { atBayRejection } from '../dockRules'
import { isFeatureUnlocked } from '../featureUnlocks'
import { noPlanetRejection, planetParamsOf } from '../planetOfState'
import { moneyShortRejection } from '../platformServices'

export const CHARGE_RULES: {
  readonly plantCharge: CommandRule<'plantCharge'>
  readonly restockCharges: CommandRule<'restockCharges'>
  readonly buyChargeRackSlot: CommandRule<'buyChargeRackSlot'>
} = {
  plantCharge: {
    fields: {},
    reject: (state, { playerId }) => plantRefusal(state, playerId),
    apply: (state, { playerId, tick }) => plantCharge(state, playerId, tick),
  },
  restockCharges: {
    fields: {},
    reject: (state, { playerId }) => restockRefusal(state, playerId),
    apply: (state, { playerId }) => restockCharges(state, playerId),
  },
  buyChargeRackSlot: {
    fields: {},
    reject: (state, { playerId }) => rackSlotRefusal(state, playerId),
    apply: (state, { playerId }) => buyRackSlot(state, playerId),
  },
}

export const CHARGE_DEBUG_RULES: {
  readonly 'debug.setCharges': CommandRule<'debug.setCharges'>
} = {
  'debug.setCharges': {
    fields: { carried: 'wholeNumber', slotLevel: 'wholeNumber' },
    reject: (_state, { payload }) => chargeCountRejection(payload),
    apply: (state, { playerId, payload }) => ({
      state: withCharges(state, playerId, {
        ...chargesOf(state, playerId),
        isRackMounted: true,
        slotLevel: payload.slotLevel,
        carried: payload.carried,
      }),
      events: [],
    }),
  },
}

/** Why planting a charge would be refused now; null when it would plant. */
export function plantRefusal(state: AuthorityState, playerId: string): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => activeVehicleRejection(vehicle),
    () => noChargeRejection(vehicle.charges),
    () => liveChargeRejection(vehicle.charges),
    () => noWallRejection(state, vehicle.pose),
  ])
}

/** Why a restock would be refused now; null when it would fill the rack. */
export function restockRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedChargesRejection(state),
    () => rackFullRejection(chargesOf(state, playerId)),
    () => moneyShortRejection(walletOf(state, playerId), restockPriceOf(state, playerId)),
  ])
}

/** Why a rack slot buy would be refused now; null when it would add one. */
export function rackSlotRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedChargesRejection(state),
    () => lastSlotRejection(chargesOf(state, playerId)),
    () => moneyShortRejection(walletOf(state, playerId), rackSlotPriceOf(state, playerId)),
  ])
}

/** What filling this player's rack costs here. */
export function restockPriceOf(state: AuthorityState, playerId: string): Money {
  return restockPrice(emptyRackSlotsOf(chargesOf(state, playerId)), state.planet.index)
}

/** What the next rack slot costs here; call only below the last slot. */
export function rackSlotPriceOf(state: AuthorityState, playerId: string): Money {
  return rackSlotPrice(chargesOf(state, playerId).slotLevel, state.planet.index)
}

/** Whether the Upgrade bay shows the charge rows: open here, or the rack already bolted on. */
export function areChargesOffered(state: AuthorityState, playerId: string): boolean {
  return (
    isFeatureUnlocked(state, BLASTING_CHARGES_ROW_ID) || chargesOf(state, playerId).isRackMounted
  )
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

function walletOf(state: AuthorityState, playerId: string): Money {
  return state.players[playerId].wallet
}

function activeVehicleRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle)) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode}`)
}

function noChargeRejection(charges: VehicleCharges): Rejection | null {
  if (charges.carried > 0) return null
  return rejectionOf('no_charges', 'the rack holds no charge')
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

function lockedChargesRejection(state: AuthorityState): Rejection | null {
  if (isFeatureUnlocked(state, BLASTING_CHARGES_ROW_ID)) return null
  return rejectionOf('feature_locked', `${BLASTING_CHARGES_ROW_ID} opens on planet 7`)
}

function rackFullRejection(charges: VehicleCharges): Rejection | null {
  if (emptyRackSlotsOf(charges) > 0) return null
  return rejectionOf('rack_full', `the rack holds ${rackCapacityOf(charges)} charges already`)
}

function lastSlotRejection(charges: VehicleCharges): Rejection | null {
  if (charges.slotLevel < rackMaxSlotLevel()) return null
  return rejectionOf('max_level', `the rack has its last slot ${rackMaxSlotLevel()}`)
}

function chargeCountRejection({ carried, slotLevel }: { carried: number; slotLevel: number }) {
  if (slotLevel > rackMaxSlotLevel()) {
    return rejectionOf('out_of_range', `slotLevel must be 0 to ${rackMaxSlotLevel()}`)
  }
  if (carried <= rackCapacity(slotLevel)) return null
  return rejectionOf('out_of_range', `carried must be 0 to ${rackCapacity(slotLevel)}`)
}

function plantCharge(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const { charges, pose } = vehicleOf(state, playerId)
  const wall = noseTileOf(pose as VehiclePose)
  const planted = { ...wall, detonateTick: tick + chargeFuseTicks() }
  const carried = charges.carried - 1
  return {
    state: withCharges(state, playerId, { ...charges, carried, planted }),
    events: [{ type: 'ChargePlanted', ...planted, carried }],
  }
}

function restockCharges(state: AuthorityState, playerId: string): RuleEffect {
  const charges = chargesOf(state, playerId)
  const price = restockPriceOf(state, playerId)
  const count = emptyRackSlotsOf(charges)
  const filled = { ...charges, isRackMounted: true, carried: rackCapacityOf(charges) }
  return {
    state: paid(withCharges(state, playerId, filled), playerId, price),
    events: [{ type: 'ChargesRestocked', count, price: toCanonical(price) }],
  }
}

function buyRackSlot(state: AuthorityState, playerId: string): RuleEffect {
  const charges = chargesOf(state, playerId)
  const price = rackSlotPriceOf(state, playerId)
  const to = charges.slotLevel + 1
  const raised = { ...charges, isRackMounted: true, slotLevel: to }
  return {
    state: paid(withCharges(state, playerId, raised), playerId, price),
    events: [
      { type: 'ChargeRackUpgraded', from: charges.slotLevel, to, price: toCanonical(price) },
    ],
  }
}

function paid(state: AuthorityState, playerId: string, price: Money): AuthorityState {
  return withWallet(state, playerId, sub(walletOf(state, playerId), price))
}
