/**
 * The 15% income-cap check (#385, split from #212 by the GD ruling 6163442862; spec #161, the
 * Systems amendment of 6 Oct): each income item at full stack (last Mark, all charges, 100% uptime,
 * the income Marks' 0.7x cooldown floor and 1.4x duration cap already in its ladder) brings at most
 * `tech.incomeCap.maxShare` of the drill's own ore value a minute on the same band. Judged on each
 * of `tech.incomeCap.planets`, every band, at the track levels the pacing bot arrived with and left
 * with (GD ruling 6160885114 Q1 (i)), on the median of the seeds.
 *
 * - The items' rates come from the kernel `incomeRates` registry, clamped there to `tripCapAt`
 *   (movers count the relocated ore value reaching the hold, Q2 (a)); a rate counts on a seed only
 *   while its anchor is owned or unlocked on that seed's run.
 * - The drill's minute: the cells it cuts in a minute of the band (1 m tiles, #6) at those levels,
 *   each worth the band's ore. A band the tip only skids on is not judged at those levels.
 * - Items are judged one at a time (#161); one share for every planet, so the check is economic
 *   only and never caps play.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { formatPercent } from '../../../systems/displayAmount'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import type { UpgradeLevels } from '../../../systems/economy/vehicleStats'
import { vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { cmp, div, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../../../systems/money'
import { incomeCapRowsOf, type IncomeAt } from '../../../systems/registries/incomeRates'
import { bandDigTicks } from '../../../systems/vehicle/bandDig'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { TREE_ECONOMY, type IncomeCap } from './treeEconomy'
import { medianShareOf } from './treeSpendGuard'

const MINUTE_TICKS = fromSafeInteger(60 * TICKS_PER_SECOND)
const BANDS = Array.from({ length: BAND_COUNT }, (_, index) => index + 1)

/** The two vehicles a planet is judged with. */
export type PlanetVisit = 'arrival' | 'departure'
const VISITS: readonly PlanetVisit[] = ['arrival', 'departure']

/** What the check reads of one seed's run. */
export interface SeedIncome {
  /** Planet to the track levels the bot entered it with and left it with. */
  levelsOn: ReadonlyMap<number, Readonly<Record<PlanetVisit, UpgradeLevels>>>
  isAnchorLive: (rowId: string) => boolean
}

export interface IncomeCapVerdict {
  planetIndex: number
  visit: PlanetVisit
  band: number
  itemId: string
  /** The item's share of the drill's minute on each seed that counts it, in seed order. */
  seedShares: readonly Money[]
  medianShare: Money
  isOverCap: boolean
}

/** One item's share on one seed at one planet, visit and band. */
interface SeedShare {
  key: string
  planetIndex: number
  visit: PlanetVisit
  band: number
  itemId: string
  share: Money
}

/** One verdict per item, planet, visit and band any seed counts it on, in that order. */
export function incomeCapVerdictsOf(
  seeds: readonly SeedIncome[],
  cap: IncomeCap = TREE_ECONOMY.incomeCap,
): IncomeCapVerdict[] {
  const shares = cap.planets.flatMap((planetIndex) => sharesOnPlanet(planetIndex, seeds))
  return groupByKey(shares).map((group) => verdictOf(group, cap))
}

/** The verdicts whose median share is over the cap. */
export function overCapVerdictsOf(verdicts: readonly IncomeCapVerdict[]): IncomeCapVerdict[] {
  return verdicts.filter((verdict) => verdict.isOverCap)
}

/** The drill's own ore value a minute on the band at these levels; null where the tip skids. */
export function drillOrePerMinuteOf(
  planetIndex: number,
  band: number,
  levels: UpgradeLevels,
): Money | null {
  const ticksPerCell = bandDigTicks(planetIndex, levels, band)
  if (ticksPerCell === null) return null
  const cellsPerMinute = div(MINUTE_TICKS, fromSafeInteger(ticksPerCell))
  return mul(cellsPerMinute, oreValue(oreTier(planetIndex, band)))
}

/**
 * The verdicts as a Markdown table: per planet and item, its worst median over the visits and
 * bands, and a planet no seed counts any item on.
 */
export function incomeCapTableOf(
  verdicts: readonly IncomeCapVerdict[],
  cap: IncomeCap = TREE_ECONOMY.incomeCap,
): string {
  return [
    '| planet | income item | worst median | at | seed shares there | cap | |',
    '|---|---|---|---|---|---|---|',
    ...cap.planets.flatMap((planetIndex) => planetLinesOf(planetIndex, verdicts, cap)),
  ].join('\n')
}

function sharesOnPlanet(planetIndex: number, seeds: readonly SeedIncome[]): SeedShare[] {
  return VISITS.flatMap((visit) =>
    BANDS.flatMap((band) =>
      seeds.flatMap((seed) => seedSharesAt(seed, { planetIndex, visit, band })),
    ),
  )
}

function seedSharesAt(
  seed: SeedIncome,
  where: { planetIndex: number; visit: PlanetVisit; band: number },
): SeedShare[] {
  const at = incomeAtOf(seed, where)
  if (at === null) return []
  return incomeCapRowsOf(at, seed.isAnchorLive).map((row) => ({
    ...where,
    key: `${where.planetIndex} ${where.visit} ${where.band} ${row.itemId}`,
    itemId: row.itemId,
    share: div(row.valuePerMinute, at.drillOrePerMinute),
  }))
}

/** Where the rates are asked; null when the seed never stood there or the drill cannot cut. */
function incomeAtOf(
  seed: SeedIncome,
  where: { planetIndex: number; visit: PlanetVisit; band: number },
): IncomeAt | null {
  const levels = seed.levelsOn.get(where.planetIndex)?.[where.visit]
  if (levels === undefined) return null
  const drillOrePerMinute = drillOrePerMinuteOf(where.planetIndex, where.band, levels)
  if (drillOrePerMinute === null || cmp(drillOrePerMinute, ZERO_MONEY) <= 0) return null
  const { cargoCapacity } = vehicleStatsAt(levels)
  return { planetIndex: where.planetIndex, band: where.band, cargoCapacity, drillOrePerMinute }
}

/** The shares grouped by planet, visit, band and item, in the order they were found. */
function groupByKey(shares: readonly SeedShare[]): SeedShare[][] {
  const groups = new Map<string, SeedShare[]>()
  for (const share of shares) groups.set(share.key, [...(groups.get(share.key) ?? []), share])
  return [...groups.values()]
}

function verdictOf(group: readonly SeedShare[], cap: IncomeCap): IncomeCapVerdict {
  const [{ planetIndex, visit, band, itemId }] = group
  const seedShares = group.map((each) => each.share)
  const medianShare = medianShareOf(seedShares)
  const isOverCap = cmp(medianShare, cap.maxShare) > 0
  return { planetIndex, visit, band, itemId, seedShares, medianShare, isOverCap }
}

function planetLinesOf(
  planetIndex: number,
  verdicts: readonly IncomeCapVerdict[],
  cap: IncomeCap,
): string[] {
  const onPlanet = verdicts.filter((verdict) => verdict.planetIndex === planetIndex)
  if (onPlanet.length === 0) return [`| P${planetIndex} | no live income item | | | | | |`]
  return itemIdsOf(onPlanet).map((itemId) =>
    worstLineOf(worstOf(onPlanet.filter((verdict) => verdict.itemId === itemId)), cap),
  )
}

function itemIdsOf(verdicts: readonly IncomeCapVerdict[]): string[] {
  return [...new Set(verdicts.map((verdict) => verdict.itemId))].sort()
}

function worstOf(verdicts: readonly IncomeCapVerdict[]): IncomeCapVerdict {
  return verdicts.reduce((worst, each) =>
    cmp(each.medianShare, worst.medianShare) > 0 ? each : worst,
  )
}

function worstLineOf(verdict: IncomeCapVerdict, cap: IncomeCap): string {
  const seeds = verdict.seedShares.map(formatPercent).join(' / ')
  const mark = verdict.isOverCap ? 'over the cap' : ''
  return (
    `| P${verdict.planetIndex} | ${verdict.itemId} | ${formatPercent(verdict.medianShare)} | ` +
    `${verdict.visit}, band ${verdict.band} | ${seeds} | ${formatPercent(cap.maxShare)} | ${mark} |`
  )
}
