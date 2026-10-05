/**
 * The workshop's `BuyUpgrade {upgradeId}` (decisions #7 and #6 section 3, #23 acceptance 6 and 7):
 * one command at the Upgrade bay (#37) raises exactly one level of one track for `upgradePrice(id, fromLevel, planet)`.
 * Hull and energy keep their values; the new maximum shows in `statsAfter` and the next repair or
 * recharge fills up to it. `vehicle_configuration_changed` follows when the sum of the six levels
 * crosses `T2` or `T3`. A refused purchase changes nothing and logs no purchase.
 */
import { costCurveIdOf, upgradePrice } from '../economy/upgradePrices'
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
import type { DomainEventBody } from './domainEvent'
import { visualTierEvents } from './vehicleDebugRules'

export const WORKSHOP_RULES: { readonly buyUpgrade: CommandRule<'buyUpgrade'> } = {
  buyUpgrade: {
    fields: { upgradeId: 'text' },
    reject: (state, { playerId, payload }) => upgradeRefusal(state, playerId, payload.upgradeId),
    apply: (state, { playerId, payload }) =>
      isUpgradeId(payload.upgradeId)
        ? buyUpgradeLevel(state, playerId, payload.upgradeId)
        : { state, events: [] },
  },
}

/** Why buying the next level of `upgradeId` would be refused now; null when it would apply. */
export function upgradeRefusal(
  state: AuthorityState,
  playerId: string,
  upgradeId: string,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => unknownUpgradeRejection(upgradeId),
    () => upgradeMoneyRejection(state, playerId, upgradeId as UpgradeId),
  ])
}

/** #33 `canBuy`: the workshop row is enabled exactly when the authority would accept it. */
export function canBuyUpgrade(state: AuthorityState, playerId: string, upgradeId: string): boolean {
  return upgradeRefusal(state, playerId, upgradeId) === null
}

/** The price of the next level of a track for this player on this planet. */
export function nextUpgradePrice(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
): Money {
  const level = vehicleOf(state, playerId).levels[upgradeId]
  return upgradePrice(upgradeId, level, state.planet.index)
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

function buyUpgradeLevel(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const cost = nextUpgradePrice(state, playerId, upgradeId)
  const upgraded = raisedOneLevel(vehicle, upgradeId)
  const paid = withWallet(withVehicle(state, playerId, upgraded), playerId, sub(wallet, cost))
  return {
    state: paid,
    events: [
      purchaseEvent(vehicle, upgraded, upgradeId, cost),
      ...visualTierEvents(vehicle, upgraded),
    ],
  }
}

function raisedOneLevel(vehicle: VehicleState, upgradeId: UpgradeId): VehicleState {
  const levels = { ...vehicle.levels, [upgradeId]: vehicle.levels[upgradeId] + 1 }
  return { ...vehicle, levels }
}

function purchaseEvent(
  before: VehicleState,
  after: VehicleState,
  upgradeId: UpgradeId,
  cost: Money,
): DomainEventBody {
  return {
    type: 'UpgradePurchased',
    upgradeId,
    kind: 'vertical',
    fromLevel: before.levels[upgradeId],
    toLevel: after.levels[upgradeId],
    cost: toCanonical(cost),
    costCurveId: costCurveIdOf(upgradeId),
    totalLevel: totalUpgradeLevel(after.levels),
    visualTier: visualTier(after.levels),
    statsAfter: canonicalStatsOf(statsOfVehicle(after)),
  }
}
