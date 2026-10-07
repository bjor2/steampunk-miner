/**
 * The Upgrade bay's blasting charge commands (spec #109 "Supply", sizes K8 #218):
 *
 * - `RestockCharges {size, count}`: at the Upgrade bay only, once `blasting_charges` is open
 *   (planet 7, #80) and the size is open on this planet, buys `count` charges of that size if their
 *   rack slots fit the rack's free slots, at `count` times the size's price rounded once; the first
 *   buy bolts the rack on. Charges that do not fit are refused `rack_full`, never trimmed (Vertical
 *   and TD on #149). Logs `charges_restocked`.
 * - `BuyChargeRackSlot {chain}`: at the Upgrade bay, once open, one more slot, up to the last. Logs
 *   `charge_rack_upgraded`, stamped with its chain (`purchaseChain.ts`).
 *
 * A buy the wallet cannot pay is refused with `money_short`, never trimmed (#8). A refused command
 * changes nothing.
 */
import { BLASTING_CHARGES_ROW_ID } from '../../art/artIds'
import { rackMaxSlotLevel, rackSlotPrice } from '../../economy/blastingCharges'
import { chargePrice, rackSlotsOf } from '../../economy/chargeSizes'
import { sub, toCanonical, type Money } from '../../money'
import {
  carriedOf,
  doChargesFit,
  freeRackSlotsOf,
  withCarried,
  type VehicleCharges,
} from '../../vehicle/vehicleCharges'
import { withWallet, type AuthorityState } from '../authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import { atBayRejection } from '../dockRules'
import { isFeatureUnlocked } from '../featureUnlocks'
import { moneyShortRejection } from '../platformServices'
import { chainStampOf, serviceReserveRejection } from '../purchaseChain'
import { chargesOf, lockedSizeRejection, unknownSizeRejection, withCharges } from './chargeRules'

export const CHARGE_SHOP_RULES: {
  readonly restockCharges: CommandRule<'restockCharges'>
  readonly buyChargeRackSlot: CommandRule<'buyChargeRackSlot'>
} = {
  restockCharges: {
    fields: { size: 'wholeNumber', count: 'wholeNumber' },
    reject: (state, { playerId, payload }) =>
      restockRefusal(state, playerId, payload.size, payload.count),
    apply: (state, { playerId, payload }) =>
      restockCharges(state, playerId, payload.size, payload.count),
  },
  buyChargeRackSlot: {
    fields: { chain: 'wholeNumber' },
    reject: (state, { playerId, payload }) => rackSlotRefusal(state, playerId, payload.chain),
    apply: (state, { playerId, payload }) => buyRackSlot(state, playerId, payload.chain),
  },
}

/** Why buying `count` charges of `size` would be refused now; null when they would be bought. */
export function restockRefusal(
  state: AuthorityState,
  playerId: string,
  size: number,
  count: number,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedChargesRejection(state),
    () => unknownSizeRejection(size),
    () => lockedSizeRejection(size, state.planet.index),
    () => noCountRejection(count),
    () => rackFullRejection(chargesOf(state, playerId), size, count),
    () => moneyShortRejection(walletOf(state, playerId), restockPriceOf(state, size, count)),
  ])
}

/**
 * Why a rack slot buy in `chain` would be refused now; null when it would add one. A held step is
 * refused under the service reserve too (`purchaseChain.ts`).
 */
export function rackSlotRefusal(
  state: AuthorityState,
  playerId: string,
  chain: number,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedChargesRejection(state),
    () => lastSlotRejection(chargesOf(state, playerId)),
    () => moneyShortRejection(walletOf(state, playerId), rackSlotPriceOf(state, playerId)),
    () => serviceReserveRejection(state, playerId, chain, rackSlotPriceOf(state, playerId)),
  ])
}

/** What `count` charges of `size` cost here. */
export function restockPriceOf(state: AuthorityState, size: number, count: number): Money {
  return chargePrice(size, count, state.planet.index)
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

function walletOf(state: AuthorityState, playerId: string): Money {
  return state.players[playerId].wallet
}

function lockedChargesRejection(state: AuthorityState): Rejection | null {
  if (isFeatureUnlocked(state, BLASTING_CHARGES_ROW_ID)) return null
  return rejectionOf('feature_locked', `${BLASTING_CHARGES_ROW_ID} opens on planet 7`)
}

function noCountRejection(count: number): Rejection | null {
  if (count >= 1) return null
  return rejectionOf('out_of_range', 'count must be at least 1')
}

function rackFullRejection(charges: VehicleCharges, size: number, count: number) {
  if (doChargesFit(charges, size, count)) return null
  const slots = count * rackSlotsOf(size)
  const free = freeRackSlotsOf(charges)
  return rejectionOf('rack_full', `${count} size-${size} charges take ${slots} slots; ${free} free`)
}

function lastSlotRejection(charges: VehicleCharges): Rejection | null {
  if (charges.slotLevel < rackMaxSlotLevel()) return null
  return rejectionOf('max_level', `the rack has its last slot ${rackMaxSlotLevel()}`)
}

function restockCharges(
  state: AuthorityState,
  playerId: string,
  size: number,
  count: number,
): RuleEffect {
  const charges = chargesOf(state, playerId)
  const price = restockPriceOf(state, size, count)
  const filled = withCarried(charges, size, carriedOf(charges, size) + count)
  return {
    state: paid(withCharges(state, playerId, { ...filled, isRackMounted: true }), playerId, price),
    events: [{ type: 'ChargesRestocked', size, count, price: toCanonical(price) }],
  }
}

function buyRackSlot(state: AuthorityState, playerId: string, chain: number): RuleEffect {
  const charges = chargesOf(state, playerId)
  const price = rackSlotPriceOf(state, playerId)
  const to = charges.slotLevel + 1
  const raised = { ...charges, isRackMounted: true, slotLevel: to }
  const after = paid(withCharges(state, playerId, raised), playerId, price)
  const purchase = { from: charges.slotLevel, to, price: toCanonical(price) }
  return {
    state: after,
    events: [{ type: 'ChargeRackUpgraded', ...purchase, ...chainStampOf(after, playerId, chain) }],
  }
}

function paid(state: AuthorityState, playerId: string, price: Money): AuthorityState {
  return withWallet(state, playerId, sub(walletOf(state, playerId), price))
}
