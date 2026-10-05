/**
 * The platform's services for a docked vehicle (decision #8, prices from #6 section 4, rounding
 * from #20): the shop sells ore at `floorMilli(V(t))` per unit, the workshop repairs the missing
 * hull and the charging station refills the missing energy, each charge rounded up with
 * `ceilMilli` by its price function. `QuickService` is the three in order (sell all, repair,
 * recharge) at current prices, with their own events and none of its own.
 *
 * Selling, recharging and the quick action are the Sell bay's; repair is the Upgrade bay's (#37),
 * though the quick action at the Sell bay still repairs at the same price.
 *
 * A charge the wallet cannot pay is refused with `money_short`, never trimmed to what it can pay.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { oreSalePrice } from '../economy/oreEconomy'
import { rechargePrice, repairPrice } from '../economy/planetCharges'
import {
  add,
  cmp,
  div,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../money'
import {
  energyMaxQuantaOf,
  statsOfVehicle,
  type Cargo,
  type VehicleState,
} from '../vehicle/vehicleState'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { atBayRejection } from './dockRules'
import type { SaleMode, SoldItem } from './domainEvent'

/** One ore tier, or the whole hold's ore. */
export type OreSelection = number | 'all'

/** What each service costs or pays right now, as the platform screen shows it (#33). */
export interface ServiceQuote {
  saleValue: Money
  repairCost: Money
  rechargeCost: Money
}

const QUANTA_PER_UNIT = fromSafeInteger(ENERGY_QUANTA_PER_UNIT)

export const PLATFORM_SERVICE_RULES: {
  readonly sellCargo: CommandRule<'sellCargo'>
  readonly repairHull: CommandRule<'repairHull'>
  readonly rechargeEnergy: CommandRule<'rechargeEnergy'>
  readonly quickService: CommandRule<'quickService'>
} = {
  sellCargo: {
    fields: { resourceTier: 'tierOrAll' },
    reject: (state, { playerId, payload }) =>
      firstRejection([
        () => atBayRejection(state, playerId, 'sell'),
        () => nothingToSellRejection(vehicleOf(state, playerId).cargo, payload.resourceTier),
      ]),
    apply: (state, { playerId, payload }) => sellOre(state, playerId, payload.resourceTier),
  },
  repairHull: {
    fields: {},
    reject: (state, { playerId }) =>
      firstRejection([
        () => atBayRejection(state, playerId, 'upgrade'),
        () => hullFullRejection(vehicleOf(state, playerId)),
        () => moneyShortRejection(walletOf(state, playerId), repairCostOf(state, playerId)),
      ]),
    apply: (state, { playerId }) => repairHull(state, playerId),
  },
  rechargeEnergy: {
    fields: {},
    reject: (state, { playerId }) =>
      firstRejection([
        () => atBayRejection(state, playerId, 'sell'),
        () => energyFullRejection(vehicleOf(state, playerId)),
        () => moneyShortRejection(walletOf(state, playerId), rechargeCostOf(state, playerId)),
      ]),
    apply: (state, { playerId }) => rechargeEnergy(state, playerId),
  },
  quickService: {
    fields: {},
    reject: (state, { playerId }) =>
      firstRejection([
        () => atBayRejection(state, playerId, 'sell'),
        () => nothingToServiceRejection(serviceQuote(state, playerId)),
        () => quickServiceMoneyRejection(state, playerId),
      ]),
    apply: (state, { playerId }) =>
      chainEffects(state, [
        (current) => sellAllHeldOre(current, playerId),
        (current) => repairWhenDamaged(current, playerId),
        (current) => rechargeWhenLow(current, playerId),
      ]),
  },
}

export function serviceQuote(state: AuthorityState, playerId: string): ServiceQuote {
  return {
    saleValue: saleValueOf(soldItemsOf(vehicleOf(state, playerId).cargo, 'all')),
    repairCost: repairCostOf(state, playerId),
    rechargeCost: rechargeCostOf(state, playerId),
  }
}

/** What the quick action charges: repair plus recharge; the sale is paid in first. */
export function quickServiceCharges(quote: ServiceQuote): Money {
  return add(quote.repairCost, quote.rechargeCost)
}

/** `0.5 * V3 * hullLost / hullMax`, rounded up to 0.001 (#6, #20). */
export function repairCostOf(state: AuthorityState, playerId: string): Money {
  const vehicle = vehicleOf(state, playerId)
  const hullMax = statsOfVehicle(vehicle).hullMax
  return repairPrice(state.planet.index, sub(hullMax, vehicle.hull), hullMax)
}

/** `0.002 * V3` per missing energy unit, the missing quanta as a fraction, rounded up (#6, #20). */
export function rechargeCostOf(state: AuthorityState, playerId: string): Money {
  const vehicle = vehicleOf(state, playerId)
  const missingQuanta = energyMaxQuantaOf(vehicle) - vehicle.energy
  return rechargePrice(state.planet.index, div(fromSafeInteger(missingQuanta), QUANTA_PER_UNIT))
}

function walletOf(state: AuthorityState, playerId: string): Money {
  return state.players[playerId].wallet
}

function nothingToSellRejection(cargo: Cargo, selection: OreSelection): Rejection | null {
  if (soldItemsOf(cargo, selection).length > 0) return null
  return rejectionOf('nothing_to_sell', `the hold has no ore of ${selection}`)
}

function hullFullRejection(vehicle: VehicleState): Rejection | null {
  if (cmp(vehicle.hull, statsOfVehicle(vehicle).hullMax) < 0) return null
  return rejectionOf('hull_full', 'the hull is already full')
}

function energyFullRejection(vehicle: VehicleState): Rejection | null {
  if (vehicle.energy < energyMaxQuantaOf(vehicle)) return null
  return rejectionOf('energy_full', 'the tank is already full')
}

function nothingToServiceRejection(quote: ServiceQuote): Rejection | null {
  const isAllZero = [quote.saleValue, quote.repairCost, quote.rechargeCost].every(
    (amount) => cmp(amount, ZERO_MONEY) === 0,
  )
  return isAllZero ? rejectionOf('nothing_to_service', 'nothing to sell, repair or recharge') : null
}

function quickServiceMoneyRejection(state: AuthorityState, playerId: string): Rejection | null {
  const quote = serviceQuote(state, playerId)
  return moneyShortRejection(
    add(walletOf(state, playerId), quote.saleValue),
    quickServiceCharges(quote),
  )
}

/** A charge the wallet cannot pay; shared by every priced command. */
export function moneyShortRejection(available: Money, cost: Money): Rejection | null {
  if (cmp(available, cost) >= 0) return null
  return rejectionOf('money_short', `costs ${toCanonical(cost)}, has ${toCanonical(available)}`)
}

/** The held ore of the selection, by ascending tier; core fragments are never sold (#10). */
function soldItemsOf(cargo: Cargo, selection: OreSelection): SoldItem[] {
  return Object.entries(cargo.ore)
    .map(([tier, amount]) => ({ tier: Number.parseInt(tier, 10), amount }))
    .filter((item) => item.amount > 0 && (selection === 'all' || item.tier === selection))
    .sort((a, b) => a.tier - b.tier)
}

/** Each unit at `floorMilli(V(t))`, so the total is an exact sum (#20 rounding rule). */
function saleValueOf(items: readonly SoldItem[]): Money {
  return items.reduce(
    (total, item) => add(total, mul(oreSalePrice(item.tier), fromSafeInteger(item.amount))),
    ZERO_MONEY,
  )
}

function sellOre(state: AuthorityState, playerId: string, selection: OreSelection): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const items = soldItemsOf(vehicle.cargo, selection)
  const value = saleValueOf(items)
  const sold = withVehicle(state, playerId, {
    ...vehicle,
    cargo: withoutOre(vehicle.cargo, items),
  })
  return {
    state: withWallet(sold, playerId, add(wallet, value)),
    events: [
      { type: 'ResourceSold', items, value: toCanonical(value), mode: saleModeOf(selection) },
    ],
  }
}

function withoutOre(cargo: Cargo, items: readonly SoldItem[]): Cargo {
  const soldTiers = new Set(items.map((item) => String(item.tier)))
  const ore = Object.fromEntries(Object.entries(cargo.ore).filter(([tier]) => !soldTiers.has(tier)))
  return { ...cargo, ore }
}

function saleModeOf(selection: OreSelection): SaleMode {
  return selection === 'all' ? 'all' : 'single'
}

function repairHull(state: AuthorityState, playerId: string): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const cost = repairCostOf(state, playerId)
  const hullMax = statsOfVehicle(vehicle).hullMax
  const repaired = withVehicle(state, playerId, { ...vehicle, hull: hullMax })
  return {
    state: withWallet(repaired, playerId, sub(wallet, cost)),
    events: [
      {
        type: 'RepairPurchased',
        hullFrom: toCanonical(vehicle.hull),
        hullTo: toCanonical(hullMax),
        cost: toCanonical(cost),
      },
    ],
  }
}

function rechargeEnergy(state: AuthorityState, playerId: string): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const cost = rechargeCostOf(state, playerId)
  const energyMax = energyMaxQuantaOf(vehicle)
  const recharged = withVehicle(state, playerId, {
    ...vehicle,
    energy: energyMax,
    energyLowLogged: [],
  })
  return {
    state: withWallet(recharged, playerId, sub(wallet, cost)),
    events: [
      { type: 'EnergyRecharged', from: vehicle.energy, to: energyMax, cost: toCanonical(cost) },
    ],
  }
}

function sellAllHeldOre(state: AuthorityState, playerId: string): RuleEffect {
  const cargo = vehicleOf(state, playerId).cargo
  if (nothingToSellRejection(cargo, 'all') !== null) return unchanged(state)
  return sellOre(state, playerId, 'all')
}

function repairWhenDamaged(state: AuthorityState, playerId: string): RuleEffect {
  if (hullFullRejection(vehicleOf(state, playerId)) !== null) return unchanged(state)
  return repairHull(state, playerId)
}

function rechargeWhenLow(state: AuthorityState, playerId: string): RuleEffect {
  if (energyFullRejection(vehicleOf(state, playerId)) !== null) return unchanged(state)
  return rechargeEnergy(state, playerId)
}
