/**
 * The 15% income-cap check (#385, split from #212 by the GD ruling 6163442862; spec #161; measured
 * per trip by the Systems ruling 6167240683 and its Scaler amendment 6167249318): each income item
 * at full stack (last Mark, all charges, 100% uptime, the income Marks' 0.7x cooldown floor and
 * 1.4x duration cap already in its ladder) brings in one trip at most `tech.incomeCap.maxShareBp`
 * of a full hold of the band's ore, the unit the trip cap `tripCapAt` already holds play to
 * (#162 4.5). Judged on each of `tech.incomeCap.planets`, every band, at the track levels the
 * pacing bot arrived with and left with (GD ruling 6160885114 Q1 (i)), on the median of the seeds.
 *
 *   share = min(rate x tripMinutes, tripCapAt) / (cargo x V(t(p, b)))
 *   tripMinutes = cargo / the drill's cells a minute on the band (1 m tiles, #6)
 *
 * - The items' trips come from the kernel `incomeRates` registry (movers count the relocated ore
 *   value reaching the hold, Q2 (a)); an item counts on a seed only while its anchor is live there.
 * - Beside each share the check keeps the unclamped one. An item over the cap before the clamp
 *   passes only when play pays it through the trip ledger (`isTripCappedInPlay`), or it fails;
 *   `tech.incomeCap.knownRed` lists the items known to fail until their ledger work lands.
 * - Shares are whole basis points, rounded up (HS condition 1). A band the tip only skids on is
 *   not judged at those levels. Items are judged one at a time (#161); one share for every planet,
 *   so the check is economic only and never caps play, upgrade depth or drill speed.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import type { UpgradeLevels } from '../../../systems/economy/vehicleStats'
import { vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import {
  ceil,
  cmp,
  div,
  floorMilli,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import {
  incomeCapRowsOf,
  type IncomeAnchors,
  type IncomeAt,
  type IncomeCapRow,
} from '../../../systems/registries/incomeRates'
import { bandDigTicks } from '../../../systems/vehicle/bandDig'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { TREE_ECONOMY, type IncomeCap } from './treeEconomy'

const MINUTE_TICKS = fromSafeInteger(60 * TICKS_PER_SECOND)
const BASIS_POINTS = fromSafeInteger(10_000)
const BANDS = Array.from({ length: BAND_COUNT }, (_, index) => index + 1)

/** The two vehicles a planet is judged with. */
export type PlanetVisit = 'arrival' | 'departure'
const VISITS: readonly PlanetVisit[] = ['arrival', 'departure']

/** What the check reads of one seed's run. */
export interface SeedIncome {
  /** Planet to the track levels the bot entered it with and left with. */
  levelsOn: ReadonlyMap<number, Readonly<Record<PlanetVisit, UpgradeLevels>>>
  anchors: IncomeAnchors
}

/** One drill trip on a band: what the cap is judged against. */
export interface DrillTrip {
  drillOrePerMinute: Money
  /** The minutes the drill takes to fill the hold. */
  tripMinutes: Money
  /** A full hold of the band's ore. */
  holdValue: Money
}

export interface IncomeCapVerdict {
  planetIndex: number
  visit: PlanetVisit
  band: number
  itemId: string
  isTripCappedInPlay: boolean
  /** The item's trip share after the clamp on each seed that counts it, in seed order. */
  seedShareBps: readonly number[]
  medianShareBp: number
  /** The same before the clamp. */
  seedUnclampedBps: readonly number[]
  medianUnclampedBp: number
  /** Over the cap after the trip cap. */
  isOverCap: boolean
  /** Over the cap before the trip cap, and play does not hold it to the cap. */
  isUnheldInPlay: boolean
  /** Why it is known to fail until its ledger work lands, or null. */
  knownRedBecause: string | null
}

/** One band of a judged planet, with one of its two vehicles. */
interface JudgedPatch {
  planetIndex: number
  visit: PlanetVisit
  band: number
}

interface Standing {
  levels: UpgradeLevels
  trip: DrillTrip
}

/** One item's shares on one seed at one planet, visit and band. */
interface SeedShare {
  key: string
  planetIndex: number
  visit: PlanetVisit
  band: number
  row: IncomeCapRow
  shareBp: number
  unclampedBp: number
}

/** One verdict per item, planet, visit and band any seed counts it on, in that order. */
export function incomeCapVerdictsOf(
  seeds: readonly SeedIncome[],
  cap: IncomeCap = TREE_ECONOMY.incomeCap,
): IncomeCapVerdict[] {
  const shares = cap.planets.flatMap((planetIndex) => sharesOnPlanet(planetIndex, seeds))
  return groupByKey(shares).map((group) => verdictOf(group, cap))
}

/** The verdicts that fail the gate: over the cap, or unheld in play, and not known-red. */
export function failingVerdictsOf(verdicts: readonly IncomeCapVerdict[]): IncomeCapVerdict[] {
  return verdicts.filter((verdict) => isFailing(verdict) && verdict.knownRedBecause === null)
}

/** The verdicts that would fail but are known-red, printed beside the gate. */
export function knownRedVerdictsOf(verdicts: readonly IncomeCapVerdict[]): IncomeCapVerdict[] {
  return verdicts.filter((verdict) => isFailing(verdict) && verdict.knownRedBecause !== null)
}

export function isFailing(verdict: IncomeCapVerdict): boolean {
  return verdict.isOverCap || verdict.isUnheldInPlay
}

/** The drill's trip on the band at these levels; null where the tip skids. */
export function drillTripOf(
  planetIndex: number,
  band: number,
  levels: UpgradeLevels,
): DrillTrip | null {
  const ticksPerCell = bandDigTicks(planetIndex, levels, band)
  if (ticksPerCell === null) return null
  const cellsPerMinute = div(MINUTE_TICKS, fromSafeInteger(ticksPerCell))
  const hold = fromSafeInteger(vehicleStatsAt(levels).cargoCapacity)
  const ore = oreValue(oreTier(planetIndex, band))
  return {
    drillOrePerMinute: mul(cellsPerMinute, ore),
    tripMinutes: div(hold, cellsPerMinute),
    holdValue: mul(hold, ore),
  }
}

/**
 * `value` in whole basis points of `whole`, rounded up so a hair over the cap reads over it. The
 * trip's minutes are a quotient, so the share carries division noise in its last digits: cut to a
 * thousandth of a basis point first, the noise never rounds a share at the cap up past it.
 */
export function basisPointsOf(value: Money, whole: Money): number {
  return toSafeInteger(ceil(floorMilli(mul(div(value, whole), BASIS_POINTS))))
}

/** The middle share; with an even count, the mean of the middle two rounded up. */
export function medianBasisPointsOf(shares: readonly number[]): number {
  const sorted = [...shares].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.ceil((sorted[middle - 1] + sorted[middle]) / 2)
}

function sharesOnPlanet(planetIndex: number, seeds: readonly SeedIncome[]): SeedShare[] {
  return VISITS.flatMap((visit) =>
    BANDS.flatMap((band) =>
      seeds.flatMap((seed) => seedSharesAt(seed, { planetIndex, visit, band })),
    ),
  )
}

function seedSharesAt(seed: SeedIncome, where: JudgedPatch): SeedShare[] {
  const standing = standingOf(seed, where)
  if (standing === null) return []
  const at = incomeAtOf(where, standing)
  return incomeCapRowsOf(at, seed.anchors).map((row) => seedShareOf(where, row, standing.trip))
}

/** The seed's vehicle on the patch and its drill trip; null when it never stood there or skids. */
function standingOf(seed: SeedIncome, where: JudgedPatch): Standing | null {
  const levels = seed.levelsOn.get(where.planetIndex)?.[where.visit]
  if (levels === undefined) return null
  const trip = drillTripOf(where.planetIndex, where.band, levels)
  if (trip === null || cmp(trip.holdValue, ZERO_MONEY) <= 0) return null
  return { levels, trip }
}

function incomeAtOf(where: JudgedPatch, { levels, trip }: Standing): IncomeAt {
  const { cargoCapacity } = vehicleStatsAt(levels)
  const { drillOrePerMinute, tripMinutes } = trip
  return {
    planetIndex: where.planetIndex,
    band: where.band,
    cargoCapacity,
    drillOrePerMinute,
    tripMinutes,
  }
}

function seedShareOf(where: JudgedPatch, row: IncomeCapRow, trip: DrillTrip): SeedShare {
  return {
    ...where,
    key: `${where.planetIndex} ${where.visit} ${where.band} ${row.itemId}`,
    row,
    shareBp: basisPointsOf(row.valuePerTrip, trip.holdValue),
    unclampedBp: basisPointsOf(row.unclampedValuePerTrip, trip.holdValue),
  }
}

/** The shares grouped by planet, visit, band and item, in the order they were found. */
function groupByKey(shares: readonly SeedShare[]): SeedShare[][] {
  const groups = new Map<string, SeedShare[]>()
  for (const share of shares) groups.set(share.key, [...(groups.get(share.key) ?? []), share])
  return [...groups.values()]
}

function verdictOf(group: readonly SeedShare[], cap: IncomeCap): IncomeCapVerdict {
  const [{ planetIndex, visit, band, row }] = group
  const seedShareBps = group.map((each) => each.shareBp)
  const seedUnclampedBps = group.map((each) => each.unclampedBp)
  const medianShareBp = medianBasisPointsOf(seedShareBps)
  const medianUnclampedBp = medianBasisPointsOf(seedUnclampedBps)
  return {
    planetIndex,
    visit,
    band,
    itemId: row.itemId,
    isTripCappedInPlay: row.isTripCappedInPlay,
    seedShareBps,
    medianShareBp,
    seedUnclampedBps,
    medianUnclampedBp,
    isOverCap: medianShareBp > cap.maxShareBp,
    isUnheldInPlay: medianUnclampedBp > cap.maxShareBp && !row.isTripCappedInPlay,
    knownRedBecause: cap.knownRed[row.itemId] ?? null,
  }
}
