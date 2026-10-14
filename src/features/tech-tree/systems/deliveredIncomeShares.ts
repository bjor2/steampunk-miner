/**
 * The Vertical Scaler's guard on the #385 income cap (amendment 6167249318): beside the full-stack
 * check, each income item's share of the income the pacing bot actually earned on every planet of
 * the run, over the planet's whole stay (time-weighted), on the median of the seeds that stood on
 * the planet; over `tech.incomeCap.maxShareBp` fails. It catches short trips with part holds, which
 * the per-trip check against a full hold does not see. The extraction slice folds the run's lines
 * into the planets read here.
 */
import { cmp, ZERO_MONEY, type Money } from '../../../systems/money'
import { basisPointsOf, medianBasisPointsOf } from './incomeCapCheck'
import { basisPointsText } from './incomeCapTable'
import { TREE_ECONOMY, type IncomeCap } from './treeEconomy'

/** One planet of one seed's run: what it earned and what each income item delivered. */
export interface PlanetDelivery {
  planetIndex: number
  earned: Money
  deliveredByItem: ReadonlyMap<string, Money>
}

export interface DeliveredShareVerdict {
  planetIndex: number
  itemId: string
  /** The item's share of each seed's income on the planet, in seed order; 0 where it brought none. */
  seedShareBps: readonly number[]
  medianShareBp: number
  isOverCap: boolean
}

/** One verdict per planet and item any seed's income item delivered on, by planet then item. */
export function deliveredShareVerdictsOf(
  seeds: readonly (readonly PlanetDelivery[])[],
  cap: IncomeCap = TREE_ECONOMY.incomeCap,
): DeliveredShareVerdict[] {
  return planetIndexesOf(seeds).flatMap((planetIndex) =>
    verdictsOnPlanet(planetIndex, seedsOnPlanet(seeds, planetIndex), cap),
  )
}

export function deliveredShareTableOf(verdicts: readonly DeliveredShareVerdict[]): string {
  if (verdicts.length === 0) return 'income items delivered nothing on any planet'
  return [
    '| planet | income item | share of income earned | seed shares | |',
    '|---|---|---|---|---|',
    ...verdicts.map(verdictLineOf),
  ].join('\n')
}

function planetIndexesOf(seeds: readonly (readonly PlanetDelivery[])[]): number[] {
  const indexes = seeds.flatMap((planets) => planets.map((planet) => planet.planetIndex))
  return [...new Set(indexes)].sort((a, b) => a - b)
}

function seedsOnPlanet(
  seeds: readonly (readonly PlanetDelivery[])[],
  planetIndex: number,
): PlanetDelivery[] {
  return seeds.flatMap((planets) => planets.filter((planet) => planet.planetIndex === planetIndex))
}

function verdictsOnPlanet(
  planetIndex: number,
  planets: readonly PlanetDelivery[],
  cap: IncomeCap,
): DeliveredShareVerdict[] {
  return deliveringItemIdsOf(planets).map((itemId) => verdictOf(planetIndex, itemId, planets, cap))
}

function verdictOf(
  planetIndex: number,
  itemId: string,
  planets: readonly PlanetDelivery[],
  cap: IncomeCap,
): DeliveredShareVerdict {
  const seedShareBps = planets.map((planet) => deliveredShareBpOf(planet, itemId))
  const medianShareBp = medianBasisPointsOf(seedShareBps)
  return {
    planetIndex,
    itemId,
    seedShareBps,
    medianShareBp,
    isOverCap: medianShareBp > cap.maxShareBp,
  }
}

function deliveringItemIdsOf(planets: readonly PlanetDelivery[]): string[] {
  const itemIds = planets.flatMap((planet) => [...planet.deliveredByItem.keys()])
  return [...new Set(itemIds)].sort()
}

/** Against what the planet earned, or what the item brought where that is more (never sold). */
function deliveredShareBpOf(planet: PlanetDelivery, itemId: string): number {
  const delivered = planet.deliveredByItem.get(itemId) ?? ZERO_MONEY
  if (cmp(delivered, ZERO_MONEY) <= 0) return 0
  const income = cmp(delivered, planet.earned) > 0 ? delivered : planet.earned
  return basisPointsOf(delivered, income)
}

function verdictLineOf(verdict: DeliveredShareVerdict): string {
  const seeds = verdict.seedShareBps.map(basisPointsText).join(' / ')
  const mark = verdict.isOverCap ? 'over the cap' : ''
  return (
    `| P${verdict.planetIndex} | ${verdict.itemId} | ${basisPointsText(verdict.medianShareBp)} | ` +
    `${seeds} | ${mark} |`
  )
}
