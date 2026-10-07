/**
 * The platform's services for a docked vehicle (decision #8, prices from #6 section 4, rounding
 * from #20): the shop sells ore at `floorMilli(V(t))` per unit, the workshop repairs the missing
 * hull and the charging station refills the missing energy, each charge rounded up with
 * `ceilMilli` by its price function. `QuickService` is the three in order (sell all, repair,
 * recharge) at current prices, with their own events and none of its own; selling all starts by
 * collecting the player's ready Refinery batches (#105), paid at the shop it runs at.
 * Every ore sale pays what it can of the vehicle's lining bill out of its value, the rest carrying
 * to the visit's next payout (#76 amendment, #128, `liningBill.ts`).
 *
 * Selling and recharging are the Sell bay's; repair is the Upgrade bay's (#37). The quick action
 * works at both shops (#170): at the Sell bay it still repairs, at the Workshop it still sells and
 * recharges, at the same prices; only the Refinery refuses it.
 *
 * A charge the wallet cannot pay is refused with `money_short`, never trimmed to what it can pay.
 * A player holding `assay_beacon` (#46) sells the planet's shallow-band ore at the mid-band unit
 * price, and each lifted tier says so in `artefact_assay_applied`.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { ARTEFACT_ID } from '../artefacts/artefactOptions'
import { assayedSalePrice, bandOfTierOnPlanet, isAssayLifted } from '../economy/assayPricing'
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
import { atBayRejection, atShopRejection } from './dockRules'
import type { DomainEventBody, SaleMode, SoldItem } from './domainEvent'
import { liningPaidOutOf, payLiningBillOutOf } from './liningBill'
import { collectWhenReady, readyRefinedValueOf } from './refinery/refineryCollection'

/** One ore tier, or the whole hold's ore. */
export type OreSelection = number | 'all'

/** What each service costs or pays right now, as the platform screen shows it (#33). */
export interface ServiceQuote {
  saleValue: Money
  /** This player's ready Refinery batches, paid in with the sale (#105). */
  refinedValue: Money
  /** What selling the whole hold and collecting pays of the vehicle's lining bill (#115, #128). */
  liningPaid: Money
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
        () => atShopRejection(state, playerId),
        () => nothingToServiceRejection(serviceQuote(state, playerId)),
        () => quickServiceMoneyRejection(state, playerId),
      ]),
    apply: (state, { playerId }) =>
      chainEffects(state, [
        (current) => collectWhenReady(current, playerId),
        (current) => sellAllHeldOre(current, playerId),
        (current) => repairWhenDamaged(current, playerId),
        (current) => rechargeWhenLow(current, playerId),
      ]),
  },
}

export function serviceQuote(state: AuthorityState, playerId: string): ServiceQuote {
  const saleValue = saleValueOf(
    state,
    playerId,
    soldItemsOf(vehicleOf(state, playerId).cargo, 'all'),
  )
  const refinedValue = readyRefinedValueOf(state, playerId)
  return {
    saleValue,
    refinedValue,
    liningPaid: liningPaidOutOf(state, playerId, add(saleValue, refinedValue)),
    repairCost: repairCostOf(state, playerId),
    rechargeCost: rechargeCostOf(state, playerId),
  }
}

/** What the quick action charges: repair plus recharge; the sale is paid in first. */
export function quickServiceCharges(quote: ServiceQuote): Money {
  return add(quote.repairCost, quote.rechargeCost)
}

/** What one unit of a tier sells for to this player here: `floorMilli(V(t))`, or assayed (#46). */
export function sellBayUnitPrice(state: AuthorityState, playerId: string, tier: number): Money {
  if (!isAssayLiftedFor(state, playerId, tier)) return oreSalePrice(tier)
  return assayedSalePrice(state.planet.index, tier)
}

/** Whether `assay_beacon` lifts this tier's price for this player on this planet. */
export function isAssayLiftedFor(state: AuthorityState, playerId: string, tier: number): boolean {
  const held = state.players[playerId].artefact
  return held?.id === ARTEFACT_ID.assayBeacon && isAssayLifted(state.planet.index, tier)
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
  const amounts = [quote.saleValue, quote.refinedValue, quote.repairCost, quote.rechargeCost]
  const isAllZero = amounts.every((amount) => cmp(amount, ZERO_MONEY) === 0)
  return isAllZero ? rejectionOf('nothing_to_service', 'nothing to sell, repair or recharge') : null
}

function quickServiceMoneyRejection(state: AuthorityState, playerId: string): Rejection | null {
  const quote = serviceQuote(state, playerId)
  const paidIn = sub(add(quote.saleValue, quote.refinedValue), quote.liningPaid)
  return moneyShortRejection(add(walletOf(state, playerId), paidIn), quickServiceCharges(quote))
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

/** Each unit at its rounded unit price, so the total is an exact sum (#20 rounding rule). */
function saleValueOf(state: AuthorityState, playerId: string, items: readonly SoldItem[]): Money {
  return items.reduce(
    (total, item) =>
      add(total, mul(sellBayUnitPrice(state, playerId, item.tier), fromSafeInteger(item.amount))),
    ZERO_MONEY,
  )
}

/** One `artefact_assay_applied` per lifted tier of the sale. */
function assayEventsOf(
  state: AuthorityState,
  playerId: string,
  items: readonly SoldItem[],
): DomainEventBody[] {
  return items
    .filter((item) => isAssayLiftedFor(state, playerId, item.tier))
    .map((item) => ({
      type: 'ArtefactAssayApplied',
      tier: item.tier,
      band: bandOfTierOnPlanet(state.planet.index, item.tier),
      unitPrice: toCanonical(sellBayUnitPrice(state, playerId, item.tier)),
    }))
}

function sellOre(state: AuthorityState, playerId: string, selection: OreSelection): RuleEffect {
  const items = soldItemsOf(vehicleOf(state, playerId).cargo, selection)
  const value = saleValueOf(state, playerId, items)
  return chainEffects(state, [
    (current) => payForOre(current, playerId, items, selection),
    (current) => payLiningBillOutOf(current, playerId, value),
  ])
}

function payForOre(
  state: AuthorityState,
  playerId: string,
  items: SoldItem[],
  selection: OreSelection,
): RuleEffect {
  const { wallet, vehicle } = state.players[playerId]
  const value = saleValueOf(state, playerId, items)
  const sold = withVehicle(state, playerId, {
    ...vehicle,
    cargo: withoutOre(vehicle.cargo, items),
  })
  return {
    state: withWallet(sold, playerId, add(wallet, value)),
    events: [
      ...assayEventsOf(state, playerId, items),
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
