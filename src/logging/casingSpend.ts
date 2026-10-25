/**
 * Each planet's casing spend in a bot run (ticket 894), folded from its steps beside the pacing
 * tallies, derived from the log and never written into it (#11 section 3):
 *
 * - **casing**: the grades bought (`CasingUpgraded.price`) and the lining bills paid at the Sell
 *   bay (`LiningSettled.paid`), what the #894 share bar calls casing (grades + lining);
 * - **spend**: everything bought on the planet, travel excluded (#161 section 3): every fall of the
 *   wallet over one step less the fuel, tank and drive bought in it, plus the lining paid, which a
 *   sale settles before its proceeds reach the wallet, so it never shows as a fall;
 * - **arrival**: the money held on the planet's first step and what the next casing grade costs
 *   then, for the arrival bar (the surface grade is always owned, so the first grade the planet
 *   asks for is the one the player must afford);
 * - **collapses**: the collapses started there, which the median run must not grow.
 *
 * A step that applied a debug command (a scenario's set-up) moves only the wallet on (#11 section 4).
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { casingUpgradePrice } from '../systems/economy/casingPrices'
import { add, cmp, fromCanonical, sub, ZERO_MONEY, type Money } from '../systems/money'

export interface PlanetCasingSpend {
  planet: number
  casingSpend: Money
  spend: Money
  arrivalWallet: Money
  arrivalGradePrice: Money
  collapses: number
}

export interface CasingSpendTally {
  planets: Map<number, PlanetCasingSpend>
  /** The wallet after the last step folded; null before the first. */
  wallet: Money | null
}

export function emptyCasingSpendTally(): CasingSpendTally {
  return { planets: new Map(), wallet: null }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function tallyCasingSpendStep(
  tally: CasingSpendTally,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  const { wallet, vehicle } = state.players[playerId]
  const planet = planetSpendOf(tally, state.planet.index, wallet, vehicle.casingGrade)
  const fall = walletFallOf(tally, wallet)
  if (events.some(isDebugCommand)) return
  planet.spend = add(planet.spend, sub(fall, travelCostOf(events)))
  events.forEach((event) => tallyCasingEvent(planet, event))
}

function planetSpendOf(
  tally: CasingSpendTally,
  planet: number,
  wallet: Money,
  casingGrade: number,
): PlanetCasingSpend {
  const known = tally.planets.get(planet)
  if (known !== undefined) return known
  const arrived: PlanetCasingSpend = {
    planet,
    casingSpend: ZERO_MONEY,
    spend: ZERO_MONEY,
    arrivalWallet: tally.wallet ?? wallet,
    arrivalGradePrice: casingUpgradePrice(casingGrade),
    collapses: 0,
  }
  tally.planets.set(planet, arrived)
  return arrived
}

/** What the step took out of the wallet, zero when it rose; the wallet moves on either way. */
function walletFallOf(tally: CasingSpendTally, wallet: Money): Money {
  const before = tally.wallet ?? wallet
  tally.wallet = wallet
  return cmp(wallet, before) < 0 ? sub(before, wallet) : ZERO_MONEY
}

/** The step's fuel, tank and jump drive: travel, outside #161's spend. */
function travelCostOf(events: readonly DomainEvent[]): Money {
  return events.map(travelCostOfEvent).reduce(add, ZERO_MONEY)
}

function travelCostOfEvent(event: DomainEvent): Money {
  const isTravel =
    event.type === 'FuelBought' ||
    event.type === 'FuelTankBought' ||
    event.type === 'JumpDriveBought'
  return isTravel ? fromCanonical(event.cost) : ZERO_MONEY
}

function tallyCasingEvent(planet: PlanetCasingSpend, event: DomainEvent): void {
  if (event.type === 'CasingUpgraded') addCasing(planet, fromCanonical(event.price))
  if (event.type === 'LiningSettled') addLiningPaid(planet, fromCanonical(event.paid))
  if (event.type === 'CollapseStarted') planet.collapses += 1
}

function addCasing(planet: PlanetCasingSpend, price: Money): void {
  planet.casingSpend = add(planet.casingSpend, price)
}

/** Paid out of a sale's proceeds, so it is spend no wallet fall shows. */
function addLiningPaid(planet: PlanetCasingSpend, paid: Money): void {
  planet.casingSpend = add(planet.casingSpend, paid)
  planet.spend = add(planet.spend, paid)
}

function isDebugCommand(event: DomainEvent): boolean {
  return event.type === 'DebugCommandApplied'
}
