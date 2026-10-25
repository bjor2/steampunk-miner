/**
 * The per-planet identity trace of the PK7 gate (ticket 826; the GD lock of 24 Oct on per-planet
 * identity P1-P5), folded from a bot run's steps beside the R3 tallies, derived from the log and
 * never written into it (#11 section 3). Per planet:
 *
 * - **the decision**: the kit items bought at its merchant (count and money), the crates dropped,
 *   the flasks uncorked and the ticks each hazard tool acted (the tail counts, as in #881's lane);
 * - **the money**: every fall of the wallet over one bot step (all it spent: tracks, services,
 *   fuel, kit), the fuel bought, the sales, and the merchant's ore premium over plain V
 *   (`OreSaleLifted` from the premium row, at its lift);
 * - **the signature on the first trip**: the premium units mined before the planet's first haul
 *   docked at the Sell bay.
 */
import type { AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { corePlanetKeyOf } from '../../systems/authority/planetCoreBays'
import { liftedSalePrice, NO_LIFT } from '../../systems/economy/saleLift'
import {
  add,
  cmp,
  fromBigInt,
  fromCanonical,
  mul,
  sub,
  ZERO_MONEY,
  type Money,
} from '../../systems/money'
import { MERCHANT_PREMIUM_LIFT, merchantPremiumLiftOf } from './systems/merchantPremium'
import { PLANET_KITS } from './systems/planetKitRows'

/** One kit item's buys on one planet. */
export interface KitBuys {
  count: number
  spent: Money
}

/** One planet's decision and money in one run. */
export interface PlanetIdentity {
  planet: number
  kitBuys: Map<string, KitBuys>
  cratesDropped: number
  flasksUncorked: number
  /** Ticks each hazard tool acted, by tool id. */
  actingTicks: Map<string, number>
  spent: Money
  fuelSpent: Money
  sales: Money
  premiumIncome: Money
  /** Premium units of this planet mined before its first haul docked at the Sell bay. */
  firstTripPremiumUnits: bigint
  hasHaulDocked: boolean
}

export interface IdentityTrace {
  planets: Map<number, PlanetIdentity>
  /** The wallet after the last step folded; null before the first. */
  wallet: Money | null
  /** The tick each acting tool started at, by tool id. */
  actingSince: Map<string, number>
}

export function emptyIdentityTrace(): IdentityTrace {
  return { planets: new Map(), wallet: null, actingSince: new Map() }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function traceIdentityStep(
  trace: IdentityTrace,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  const planet = planetIdentityOf(trace, state.planet.index)
  if (events.some(isDebugCommand)) return keepWallet(trace, state.players[playerId].wallet)
  traceWalletFall(trace, planet, state.players[playerId].wallet)
  events.forEach((event) => traceEvent(trace, planet, corePlanetKeyOf(state.planet), event))
}

/** The kit item ids bought on a planet, in id order: its decision. */
export function decisionOf(planet: PlanetIdentity | undefined): string[] {
  return planet === undefined ? [] : [...planet.kitBuys.keys()].sort()
}

/** Money spent on kit items on a planet, every item or one. */
export function kitSpentOf(planet: PlanetIdentity, itemId?: string): Money {
  return [...planet.kitBuys.entries()]
    .filter(([id]) => itemId === undefined || id === itemId)
    .reduce((total, [, buys]) => add(total, buys.spent), ZERO_MONEY)
}

function planetIdentityOf(trace: IdentityTrace, planet: number): PlanetIdentity {
  const known = trace.planets.get(planet)
  if (known !== undefined) return known
  const fresh: PlanetIdentity = {
    planet,
    kitBuys: new Map(),
    cratesDropped: 0,
    flasksUncorked: 0,
    actingTicks: new Map(),
    spent: ZERO_MONEY,
    fuelSpent: ZERO_MONEY,
    sales: ZERO_MONEY,
    premiumIncome: ZERO_MONEY,
    firstTripPremiumUnits: 0n,
    hasHaulDocked: false,
  }
  trace.planets.set(planet, fresh)
  return fresh
}

/** A scenario's or debug command's money is never play (#11 section 4): only the wallet moves on. */
function keepWallet(trace: IdentityTrace, wallet: Money): void {
  trace.wallet = wallet
}

/** A step that left the wallet lower spent the difference, on the planet it ended on. */
function traceWalletFall(trace: IdentityTrace, planet: PlanetIdentity, wallet: Money): void {
  const before = trace.wallet ?? wallet
  trace.wallet = wallet
  if (cmp(wallet, before) < 0) planet.spent = add(planet.spent, sub(before, wallet))
}

function traceEvent(
  trace: IdentityTrace,
  planet: PlanetIdentity,
  planetKey: string,
  event: DomainEvent,
): void {
  if (event.type === 'planet-kit.KitItemBought') addKitBuy(planet, event.itemId, event.price)
  if (event.type === 'planet-kit.ContainerDropped') planet.cratesDropped += 1
  if (event.type === 'planet-kit.FlaskUncorked') planet.flasksUncorked += 1
  if (event.type === 'ToolActingChanged') traceActingEdge(trace, planet, event)
  if (event.type === 'FuelBought')
    planet.fuelSpent = add(planet.fuelSpent, fromCanonical(event.cost))
  if (event.type === 'ResourceSold') planet.sales = add(planet.sales, fromCanonical(event.value))
  if (event.type === 'OreSaleLifted') tracePremiumSale(planet, event)
  if (event.type === 'OrePremiumLedgerChanged') traceFirstTripPremium(planet, planetKey, event)
  if (isHaulDocked(event)) planet.hasHaulDocked = true
}

function addKitBuy(planet: PlanetIdentity, itemId: string, price: string): void {
  const buys = planet.kitBuys.get(itemId) ?? { count: 0, spent: ZERO_MONEY }
  planet.kitBuys.set(itemId, {
    count: buys.count + 1,
    spent: add(buys.spent, fromCanonical(price)),
  })
}

type ActingEvent = Extract<DomainEvent, { type: 'ToolActingChanged' }>

function traceActingEdge(trace: IdentityTrace, planet: PlanetIdentity, event: ActingEvent): void {
  if (event.on) {
    trace.actingSince.set(event.toolId, event.tick)
    return
  }
  const since = trace.actingSince.get(event.toolId) ?? event.tick
  trace.actingSince.delete(event.toolId)
  planet.actingTicks.set(
    event.toolId,
    (planet.actingTicks.get(event.toolId) ?? 0) + event.tick - since,
  )
}

type LiftedEvent = Extract<DomainEvent, { type: 'OreSaleLifted' }>

/** The premium's share of a lifted sale: each unit at the merchant's lift over plain V. */
function tracePremiumSale(planet: PlanetIdentity, event: LiftedEvent): void {
  if (event.source !== MERCHANT_PREMIUM_LIFT.id) return
  const lifted = liftedSalePrice(event.tier, merchantPremiumLiftOf(PLANET_KITS))
  const extra = mul(
    sub(lifted, liftedSalePrice(event.tier, NO_LIFT)),
    fromBigInt(BigInt(event.units)),
  )
  planet.premiumIncome = add(planet.premiumIncome, extra)
}

type LedgerEvent = Extract<DomainEvent, { type: 'OrePremiumLedgerChanged' }>

function traceFirstTripPremium(
  planet: PlanetIdentity,
  planetKey: string,
  event: LedgerEvent,
): void {
  if (planet.hasHaulDocked || event.reason !== 'mined' || event.origin !== planetKey) return
  planet.firstTripPremiumUnits += BigInt(event.units)
}

/** A haul ends where the vehicle docks at the Sell bay with a hold to sell. */
function isHaulDocked(event: DomainEvent): boolean {
  return event.type === 'DockEntered' && event.bay === 'sell' && event.cargoUnits > 0n
}

function isDebugCommand(event: DomainEvent): boolean {
  return event.type === 'DebugCommandApplied'
}
