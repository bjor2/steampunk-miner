/**
 * What a run freed through the mining gates, planet by planet, read from its events only (#142
 * acceptance 9 and 10, ticket 237): the dynamite-gated cells charges freed with their sale value
 * and what those charges cost, and the extractor-gated cells the extractors freed. `balance:charges`
 * judges the bot's medians on them: dynamite clears and payback (#143 guard 2, the GD lock on
 * #218: the bot's `gate_cleared` value over the price of the charges that freed them, at least 2x)
 * and extractor clears (GD lock on #148: a median of 1.5 or more a run).
 *
 * A shell counts as `gateKind: dynamite` freed by dynamite, an extractor cell as `gateKind: rig`
 * freed by its extractor; a drill-gated signature a blast broke is neither. A charge's price counts once, against the first gated cell its blast freed; a charge that freed
 * none is no gate's cost. Gated cells freed after a detonation belong to it until the next one.
 */
import { chargePrice } from '../systems/economy/chargeSizes'
import { add, cmp, div, fromCanonical, ZERO_MONEY, type Money } from '../systems/money'
import type { RunEvent } from './runEvent'

export interface PlanetGateClears {
  dynamiteClears: number
  dynamiteValue: Money
  /** The price of each charge whose blast freed a dynamite-gated cell. */
  dynamiteSpend: Money
  extractorClears: number
  extractorValue: Money
}

/** The slice's line, read by name: the kernel never imports a slice. */
const GATE_CLEARED_LINE = 'mining-gates.gate_cleared'
const SHIPPED_SIZE = 1

const NOTHING_FREED: PlanetGateClears = {
  dynamiteClears: 0,
  dynamiteValue: ZERO_MONEY,
  dynamiteSpend: ZERO_MONEY,
  extractorClears: 0,
  extractorValue: ZERO_MONEY,
}

interface Detonation {
  planet: number
  size: number
  isCounted: boolean
}

interface Tally {
  byPlanet: Map<number, PlanetGateClears>
  detonation: Detonation | null
}

export function gateClearsByPlanet(events: readonly RunEvent[]): Map<number, PlanetGateClears> {
  return events.reduce(talliedWith, { byPlanet: new Map(), detonation: null }).byPlanet
}

/** What one planet's freed cells were worth over the charges that freed them; null with none. */
export function dynamitePaybackOf(clears: PlanetGateClears): Money | null {
  if (clears.dynamiteClears === 0 || cmp(clears.dynamiteSpend, ZERO_MONEY) === 0) return null
  return div(clears.dynamiteValue, clears.dynamiteSpend)
}

export function gateClearsOn(
  byPlanet: ReadonlyMap<number, PlanetGateClears>,
  planet: number,
): PlanetGateClears {
  return byPlanet.get(planet) ?? NOTHING_FREED
}

function talliedWith(tally: Tally, event: RunEvent): Tally {
  if (event.event === 'charge_detonated') {
    const size = (event.data as { size?: number }).size ?? SHIPPED_SIZE
    return { ...tally, detonation: { planet: event.planet, size, isCounted: false } }
  }
  if ((event.event as string) !== GATE_CLEARED_LINE) return tally
  const data = event.data as { gateKind?: string; method?: string; value?: string }
  const freedBy = `${data.gateKind}:${data.method}`
  if (freedBy === 'dynamite:dynamite') return withDynamiteClear(tally, event.planet, data.value)
  if (freedBy === 'rig:rig') return withExtractorClear(tally, event.planet, data.value)
  return tally
}

function withDynamiteClear(tally: Tally, planet: number, value: string | undefined): Tally {
  const known = gateClearsOn(tally.byPlanet, planet)
  const charge = uncountedChargeOn(tally.detonation, planet)
  tally.byPlanet.set(planet, {
    ...known,
    dynamiteClears: known.dynamiteClears + 1,
    dynamiteValue: add(known.dynamiteValue, moneyOf(value)),
    dynamiteSpend: charge === null ? known.dynamiteSpend : add(known.dynamiteSpend, charge),
  })
  const detonation = tally.detonation === null ? null : { ...tally.detonation, isCounted: true }
  return { ...tally, detonation }
}

function withExtractorClear(tally: Tally, planet: number, value: string | undefined): Tally {
  const known = gateClearsOn(tally.byPlanet, planet)
  tally.byPlanet.set(planet, {
    ...known,
    extractorClears: known.extractorClears + 1,
    extractorValue: add(known.extractorValue, moneyOf(value)),
  })
  return tally
}

/** The price of the last charge, if it blew on this planet and no clear has counted it yet. */
function uncountedChargeOn(detonation: Detonation | null, planet: number): Money | null {
  if (detonation === null || detonation.isCounted || detonation.planet !== planet) return null
  return chargePrice(detonation.size, 1, planet)
}

function moneyOf(value: string | undefined): Money {
  return value === undefined ? ZERO_MONEY : fromCanonical(value)
}
