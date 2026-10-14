/**
 * What the income items actually delivered in a run, per planet (Vertical Scaler guard on the #385
 * ruling, amendment 6167249318): each item's `drain_yield` value beside the money the run earned on
 * the planet (`resource_sold` and `refine_collected`, as the run summary counts money earned). Over
 * the planet's whole stay, so the share is the time-weighted one: a short trip with a part hold
 * weighs what it earned. Derived from the lines as they pass, never written into the log, so a
 * lane that keeps no log can fold it.
 */
import type { RunEvent } from '../../logging/runEvent'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../../systems/money'
import { DRAIN_YIELD_EVENT } from './logging'

/** One planet's income: what the run earned and what each income item delivered. */
export interface PlanetIncome {
  planetIndex: number
  earned: Money
  deliveredByItem: ReadonlyMap<string, Money>
}

export interface DeliveredIncomeFold {
  add(event: RunEvent): void
  /** Every planet with money earned or an item's delivery, by planet index. */
  planets(): PlanetIncome[]
}

interface PlanetTally {
  earned: Money
  deliveredByItem: Map<string, Money>
}

/** The lines that pay money at the Sell bay, as `runSummary.ts` counts `moneyEarned`. */
const EARNING_EVENTS: ReadonlySet<string> = new Set(['resource_sold', 'refine_collected'])

export function startDeliveredIncomeFold(): DeliveredIncomeFold {
  const tallies = new Map<number, PlanetTally>()
  return {
    add: (event) => tallyLine(tallies, event),
    planets: () => planetIncomesOf(tallies),
  }
}

function tallyLine(tallies: Map<number, PlanetTally>, line: RunEvent): void {
  if (EARNING_EVENTS.has(line.event)) tallyEarning(tallyOn(tallies, line.planet), line)
  if (isDrainYieldLine(line)) tallyDelivery(tallyOn(tallies, line.planet), line)
}

/** Slice names sit outside the kernel's name union, so the line is matched as text. */
function isDrainYieldLine({ event }: { event: string }): boolean {
  return event === DRAIN_YIELD_EVENT
}

function tallyOn(tallies: Map<number, PlanetTally>, planetIndex: number): PlanetTally {
  const tally = tallies.get(planetIndex) ?? { earned: ZERO_MONEY, deliveredByItem: new Map() }
  tallies.set(planetIndex, tally)
  return tally
}

function tallyEarning(tally: PlanetTally, line: RunEvent): void {
  tally.earned = add(tally.earned, valueOf(line))
}

function tallyDelivery(tally: PlanetTally, line: RunEvent): void {
  const { itemId } = line.data as unknown as { itemId: string }
  const delivered = tally.deliveredByItem.get(itemId) ?? ZERO_MONEY
  tally.deliveredByItem.set(itemId, add(delivered, valueOf(line)))
}

function valueOf(line: RunEvent): Money {
  return fromCanonical((line.data as unknown as { value: string }).value)
}

function planetIncomesOf(tallies: ReadonlyMap<number, PlanetTally>): PlanetIncome[] {
  return [...tallies.entries()]
    .sort(([a], [b]) => a - b)
    .map(([planetIndex, tally]) => ({ planetIndex, ...tally }))
}
