/**
 * The purchase pace after a planet's first gem haul (ticket 741, the HS's P3 check on #741,
 * done-when 5: upgrades bought with money alone must not turn trivially cheap once the first gems
 * are sold), folded from a bot run's steps beside the drill pace (`drillPace.ts`): per planet, the
 * tick the first gem unit reached the hold, then the drill + tip majors and all purchases from that
 * tick to the core. Printed for the Tester beside the gated drill + tip bar (3.5 to 7.0 a planet,
 * `drillPaceBars.ts`), never gated here. A unit is a gem when it is worth at least the planet's
 * cheapest gem: every other ore of the planet sells below it (`gemTiers.test.ts`).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { oreSalePrice } from '../systems/economy/oreEconomy'
import { cmp, fromCanonical, fromSafeInteger, mul } from '../systems/money'
import { gemSaleTiersOfPlanet } from '../systems/registries/planetRow'

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const MINUTE_PLACES = 1

/** One planet's purchases after its first gem unit, in one run. */
export interface PlanetGemHaul {
  planet: number
  arrivalTick: number
  firstGemTick: number | null
  coreTick: number | null
  drillTipMajorsAfter: number
  purchasesAfter: number
}

export interface GemHaulTally {
  planets: Map<number, PlanetGemHaul>
}

export function emptyGemHaulTally(): GemHaulTally {
  return { planets: new Map() }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function tallyGemHaulStep(
  tally: GemHaulTally,
  state: AuthorityState,
  events: readonly DomainEvent[],
): void {
  const planet = planetHaulOf(tally, state.planet.index, state.tick)
  events.forEach((event) => tallyHaulEvent(planet, state.tick, event))
}

/** One line per seed for `planet`: when its first gem came and what was bought after it. */
export function gemHaulLinesOf(
  runs: readonly { worldSeed: number; gemHaul: GemHaulTally }[],
  planet: number,
): string[] {
  return runs.map(({ worldSeed, gemHaul }) =>
    gemHaulLineOf(worldSeed, gemHaul.planets.get(planet) ?? null),
  )
}

function planetHaulOf(tally: GemHaulTally, planet: number, tick: number): PlanetGemHaul {
  const known = tally.planets.get(planet)
  if (known !== undefined) return known
  const fresh: PlanetGemHaul = {
    planet,
    arrivalTick: tick,
    firstGemTick: null,
    coreTick: null,
    drillTipMajorsAfter: 0,
    purchasesAfter: 0,
  }
  tally.planets.set(planet, fresh)
  return fresh
}

function tallyHaulEvent(planet: PlanetGemHaul, tick: number, event: DomainEvent): void {
  if (event.type === 'CargoAdded') tallyFirstGem(planet, tick, event)
  if (event.type === 'CoreCompleted' && planet.coreTick === null) planet.coreTick = tick
  if (event.type === 'UpgradePurchased') tallyPurchaseAfterGem(planet, event)
}

function tallyFirstGem(planet: PlanetGemHaul, tick: number, event: CargoAddedEvent): void {
  if (planet.firstGemTick === null && isGemUnit(planet.planet, event)) planet.firstGemTick = tick
}

function tallyPurchaseAfterGem(planet: PlanetGemHaul, event: PurchaseEvent): void {
  if (planet.firstGemTick === null || planet.coreTick !== null) return
  planet.purchasesAfter++
  if (isDrillTipMajor(event)) planet.drillTipMajorsAfter++
}

type CargoAddedEvent = Extract<DomainEvent, { type: 'CargoAdded' }>
type PurchaseEvent = Extract<DomainEvent, { type: 'UpgradePurchased' }>

/** Worth at least the planet's cheapest gem, so a gem: no other ore of the planet is. */
function isGemUnit(planet: number, event: CargoAddedEvent): boolean {
  const [cheapest] = gemSaleTiersOfPlanet(planet)
  if (cheapest === undefined) return false
  const gemValue = mul(oreSalePrice(cheapest), fromSafeInteger(event.amount))
  return cmp(fromCanonical(event.value), gemValue) >= 0
}

/** Each drill purchase is a major, and a tip purchase is one when it says so (#551). */
function isDrillTipMajor(event: PurchaseEvent): boolean {
  return event.upgradeId === 'drill_power' || (event.upgradeId === 'drill_tip' && event.isMajor)
}

function gemHaulLineOf(worldSeed: number, haul: PlanetGemHaul | null): string {
  if (haul === null) return `seed ${worldSeed}: never reached`
  if (haul.firstGemTick === null) return `seed ${worldSeed} P${haul.planet}: no gem before the core`
  const firstMinute = minutesOf(haul.firstGemTick - haul.arrivalTick)
  const toCore = haul.coreTick === null ? 'never' : minutesOf(haul.coreTick - haul.firstGemTick)
  return [
    `seed ${worldSeed} P${haul.planet}: first gem at minute ${firstMinute} of the planet,`,
    `${haul.drillTipMajorsAfter} drill + tip majors and ${haul.purchasesAfter} purchases`,
    `in the ${toCore} minutes from it to the core`,
  ].join(' ')
}

function minutesOf(ticks: number): string {
  return (ticks / TICKS_PER_MINUTE).toFixed(MINUTE_PLACES)
}
