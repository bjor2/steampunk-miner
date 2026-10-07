/**
 * The pacing bot's spree metric (#180 section 4, Systems on the spree metric and amendment 2): at
 * every Workshop visit, after the sale and the service, `spree_capacity {track, steps}` is the run
 * of consecutive steps a held chain could buy on each track from `wallet - serviceReserve`, every
 * price in Money. The visit also keeps what the trip before it sold for and the steps the bot's
 * greedy plan bought on each track, the numbers the spree targets are judged on (`spreeTargets.ts`).
 * Measured by the bot and kept beside its run like the shop spend, never written into the log.
 */
import { serviceReserveOf } from '../authority/serviceReserve'
import type { DomainEvent } from '../authority/domainEvent'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { stepPrice } from '../economy/upgradePrices'
import { minorsPerMajor } from '../economy/upgradeSteps'
import type { UpgradeLevels } from '../economy/vehicleStats'
import { add, cmp, fromCanonical, sub, ZERO_MONEY, type Money } from '../money'
import type { BotSession } from './botSession'

export interface SpreeVisit {
  planetIndex: number
  /** What the trip before the visit sold for: ore sales and refined batches collected. */
  income: Money
  /** Per track, the steps in a row `wallet - serviceReserve` pays for, counted to `SPREE_CAP`. */
  capacity: Readonly<Record<UpgradeId, number>>
  /** Per track, the steps the bot bought at the visit; 0 on a track it left alone. */
  stepsBought: Readonly<Record<UpgradeId, number>>
}

/** Ten majors of steps: far past the spree of 10 the targets ask about. */
export const SPREE_CAP = 10 * minorsPerMajor()

/** The capacity before the bot shops, for `visitOf` once it has. */
export interface SpreeMeasure {
  planetIndex: number
  income: Money
  capacity: Readonly<Record<UpgradeId, number>>
  levelsBefore: UpgradeLevels
}

/** `incomeEvents` are the events since the last visit, the trip's sales among them. */
export function measureSpree(
  session: BotSession,
  incomeEvents: readonly DomainEvent[],
): SpreeMeasure {
  const state = session.state()
  const levels = session.vehicle().levels
  return {
    planetIndex: state.planet.index,
    income: incomeOf(incomeEvents, session.playerId),
    capacity: capacityOf(levels, state.planet.index, spreeBudgetOf(session)),
    levelsBefore: levels,
  }
}

/** What a held chain may spend: the wallet above the service reserve. */
function spreeBudgetOf(session: BotSession): Money {
  const state = session.state()
  return sub(state.players[session.playerId].wallet, serviceReserveOf(state, session.playerId))
}

function capacityOf(
  levels: UpgradeLevels,
  planetIndex: number,
  budget: Money,
): Record<UpgradeId, number> {
  const entries = UPGRADE_IDS.map(
    (track) => [track, stepsPaidFor(track, levels[track], planetIndex, budget)] as const,
  )
  return Object.fromEntries(entries) as Record<UpgradeId, number>
}

/** The visit, from the measure taken before shopping and the levels the shopping left. */
export function visitOf(measure: SpreeMeasure, levelsAfter: UpgradeLevels): SpreeVisit {
  const { levelsBefore, ...visit } = measure
  const entries = UPGRADE_IDS.map(
    (track) => [track, levelsAfter[track] - levelsBefore[track]] as const,
  )
  return { ...visit, stepsBought: Object.fromEntries(entries) as Record<UpgradeId, number> }
}

/** Consecutive steps from `step` whose prices add up to at most `budget`, at most `SPREE_CAP`. */
function stepsPaidFor(track: UpgradeId, step: number, planetIndex: number, budget: Money): number {
  let spent = ZERO_MONEY
  for (let steps = 0; steps < SPREE_CAP; steps++) {
    spent = add(spent, stepPrice(track, step + steps, planetIndex))
    if (cmp(spent, budget) > 0) return steps
  }
  return SPREE_CAP
}

function incomeOf(events: readonly DomainEvent[], playerId: string): Money {
  return events
    .filter((event) => event.playerId === playerId)
    .map(soldValueOf)
    .reduce(add, ZERO_MONEY)
}

function soldValueOf(event: DomainEvent): Money {
  if (event.type === 'ResourceSold' || event.type === 'RefineCollected') {
    return fromCanonical(event.value)
  }
  return ZERO_MONEY
}
