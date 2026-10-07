/**
 * The workshop's `BuyUpgrade {upgradeId}` (decisions #7 and #6 section 3, #23 acceptance 6 and 7):
 * one command at the Upgrade bay (#37) raises one track by exactly one step for
 * `stepPrice(id, fromStep, planet)`: a pip, or on the tenth step the big level-up (#180 sections 3
 * and 4). Hull and energy keep their values; the new maximum shows in `statsAfter` and the next
 * repair or recharge fills up to it. `vehicle_configuration_changed` follows when the sum of the
 * six major levels crosses `T2` or `T3`. A refused purchase changes nothing and logs no purchase.
 * A held step (`chain` not 0) is also refused under the service reserve (`purchaseChain.ts`).
 */
import { costCurveIdOf, stepPrice } from '../economy/upgradePrices'
import { isMajorStep, majorOf } from '../economy/upgradeSteps'
import { totalUpgradeLevel, visualTier } from '../economy/vehicleStats'
import { cmp, sub, toCanonical, type Money } from '../money'
import { isUpgradeId } from '../vehicle/vehicleStats'
import { canonicalStatsOf } from '../vehicle/vehicleStatsView'
import { statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import type { UpgradeId } from '../economy/economyDefinition'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { atBayRejection } from './dockRules'
import type { DomainEventBody, PurchaseChainStamp } from './domainEvent'
import { chainStampOf, CLICK_CHAIN, serviceReserveRejection } from './purchaseChain'
import { visualTierEvents } from './vehicleDebugRules'

export const WORKSHOP_RULES: { readonly buyUpgrade: CommandRule<'buyUpgrade'> } = {
  buyUpgrade: {
    fields: { upgradeId: 'text', chain: 'wholeNumber' },
    reject: (state, { playerId, payload }) =>
      upgradeRefusal(state, playerId, payload.upgradeId, payload.chain),
    apply: (state, { playerId, payload }) =>
      isUpgradeId(payload.upgradeId)
        ? buyUpgradeLevel(state, playerId, payload.upgradeId, payload.chain)
        : { state, events: [] },
  },
}

/** Why the next step of `upgradeId` in `chain` would be refused now; null when it would apply. */
export function upgradeRefusal(
  state: AuthorityState,
  playerId: string,
  upgradeId: string,
  chain: number,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => unknownUpgradeRejection(upgradeId),
    () => upgradeMoneyRejection(state, playerId, upgradeId as UpgradeId),
    () => upgradeReserveRejection(state, playerId, upgradeId as UpgradeId, chain),
  ])
}

/** #33 `canBuy`: the workshop row is enabled exactly when the authority would accept a click. */
export function canBuyUpgrade(state: AuthorityState, playerId: string, upgradeId: string): boolean {
  return upgradeRefusal(state, playerId, upgradeId, CLICK_CHAIN) === null
}

/** The price of the next step of a track for this player on this planet. */
export function nextUpgradePrice(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
): Money {
  const step = vehicleOf(state, playerId).levels[upgradeId]
  return stepPrice(upgradeId, step, state.planet.index)
}

function unknownUpgradeRejection(upgradeId: string): Rejection | null {
  if (isUpgradeId(upgradeId)) return null
  return rejectionOf('unknown_upgrade', `${upgradeId} is not a registered upgrade id`)
}

function upgradeMoneyRejection(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
): Rejection | null {
  const price = nextUpgradePrice(state, playerId, upgradeId)
  const wallet = state.players[playerId].wallet
  if (cmp(wallet, price) >= 0) return null
  return rejectionOf('money_short', `costs ${toCanonical(price)}, has ${toCanonical(wallet)}`)
}

function upgradeReserveRejection(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
  chain: number,
): Rejection | null {
  const price = nextUpgradePrice(state, playerId, upgradeId)
  return serviceReserveRejection(state, playerId, chain, price)
}

function buyUpgradeLevel(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
  chain: number,
): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const cost = nextUpgradePrice(state, playerId, upgradeId)
  const upgraded = raisedOneStep(vehicle, upgradeId)
  const paid = withWallet(withVehicle(state, playerId, upgraded), playerId, sub(wallet, cost))
  const chainStamp = chainStampOf(paid, playerId, chain)
  return {
    state: paid,
    events: [
      purchaseEvent(vehicle, upgraded, upgradeId, cost, chainStamp),
      ...visualTierEvents(vehicle, upgraded),
    ],
  }
}

function raisedOneStep(vehicle: VehicleState, upgradeId: UpgradeId): VehicleState {
  const levels = { ...vehicle.levels, [upgradeId]: vehicle.levels[upgradeId] + 1 }
  return { ...vehicle, levels }
}

function purchaseEvent(
  before: VehicleState,
  after: VehicleState,
  upgradeId: UpgradeId,
  cost: Money,
  chainStamp: PurchaseChainStamp,
): DomainEventBody {
  const fromLevel = before.levels[upgradeId]
  return {
    type: 'UpgradePurchased',
    ...chainStamp,
    upgradeId,
    kind: 'vertical',
    fromLevel,
    toLevel: after.levels[upgradeId],
    fromMajor: majorOf(fromLevel),
    toMajor: majorOf(after.levels[upgradeId]),
    isMajor: isMajorStep(fromLevel),
    cost: toCanonical(cost),
    costCurveId: costCurveIdOf(upgradeId),
    totalLevel: totalUpgradeLevel(after.levels),
    visualTier: visualTier(after.levels),
    statsAfter: canonicalStatsOf(statsOfVehicle(after)),
  }
}
