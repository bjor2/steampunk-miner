/**
 * The spree targets of #180 section 4, judged per track (GD lock on #181, 7 Oct), on the pacing
 * bot's Workshop visits (`spreeCapacity.ts`): the median steps per bought track a visit is 6 to
 * 12, and 25 to 45% of the trips with above-median income buy `spreeSteps` or more steps on one
 * track, which always crosses a major. The steps a whole visit buys and the capacity
 * `wallet - serviceReserve` leaves are information only. 10 minors per major and the curves stay;
 * #225 re-measures after #195 and #146. Reported by `npm run balance:report`.
 */
import { PACING_TARGETS } from '../../constants/pacingTargets'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { add, cmp, div, fromSafeInteger, type Money } from '../money'
import type { SpreeVisit } from './spreeCapacity'

export interface SpreeTargets {
  visits: number
  /** Over the visits that bought, the median of steps bought over tracks bought; null with none. */
  medianStepsPerBoughtTrack: number | null
  /** Information only: the median steps a whole visit bought; null with no visit. */
  medianStepsPerVisit: number | null
  /** Trips whose income is above the median trip's. */
  goodTrips: number
  /** Of those, the trips that bought `spreeSteps` or more on one track. */
  goodTripsWithSpree: number
  /** Information only: of those, the trips that could chain `spreeSteps` on a track they bought. */
  goodTripsWithSpreeCapacity: number
}

export function spreeTargetsOf(visits: readonly SpreeVisit[]): SpreeTargets {
  const good = aboveMedianIncome(visits)
  return {
    visits: visits.length,
    medianStepsPerBoughtTrack: medianOf(visits.filter(hasBought).map(stepsPerBoughtTrackOf)),
    medianStepsPerVisit: medianOf(visits.map(stepsOfVisit)),
    goodTrips: good.length,
    goodTripsWithSpree: good.filter(hasBoughtSpree).length,
    goodTripsWithSpreeCapacity: good.filter(couldChainSpree).length,
  }
}

/** The share of good trips with a spree, in whole percent rounded down; null with none. */
export function spreePercentOf(targets: SpreeTargets): number | null {
  if (targets.goodTrips === 0) return null
  return Math.floor((100 * targets.goodTripsWithSpree) / targets.goodTrips)
}

/** The targets missed, as report lines; empty when both are met. */
export function spreeTargetMisses(targets: SpreeTargets): string[] {
  return [stepsPerBoughtTrackMiss(targets), spreeShareMiss(targets)].filter(
    (miss): miss is string => miss !== null,
  )
}

function stepsPerBoughtTrackMiss(targets: SpreeTargets): string | null {
  const range = PACING_TARGETS.spree.stepsPerBoughtTrack
  const median = targets.medianStepsPerBoughtTrack
  if (median !== null && isWithin(median, range)) return null
  return `median steps per bought track ${stepsText(median)}, target ${rangeText(range)}`
}

function spreeShareMiss(targets: SpreeTargets): string | null {
  const range = PACING_TARGETS.spree.spreePercent
  const percent = spreePercentOf(targets)
  if (percent !== null && isWithin(percent, range)) return null
  return `above-median trips that bought a spree ${percent ?? 'none'}%, target ${rangeText(range)}%`
}

export function spreeTargetsText(targets: SpreeTargets): string {
  const { spreeSteps } = PACING_TARGETS.spree
  return [
    `${targets.visits} visits, median ${stepsText(targets.medianStepsPerBoughtTrack)} steps ` +
      `per bought track (info: ${targets.medianStepsPerVisit ?? '-'} steps a visit)`,
    `${targets.goodTripsWithSpree} of ${targets.goodTrips} above-median trips bought ` +
      `${spreeSteps}+ steps on one track (${spreePercentOf(targets) ?? '-'}%; info: ` +
      `${targets.goodTripsWithSpreeCapacity} could chain ${spreeSteps}+)`,
  ].join('; ')
}

function boughtTracksOf(visit: SpreeVisit): UpgradeId[] {
  return UPGRADE_IDS.filter((track) => visit.stepsBought[track] > 0)
}

function hasBought(visit: SpreeVisit): boolean {
  return boughtTracksOf(visit).length > 0
}

function stepsOfVisit(visit: SpreeVisit): number {
  return UPGRADE_IDS.reduce((steps, track) => steps + visit.stepsBought[track], 0)
}

function stepsPerBoughtTrackOf(visit: SpreeVisit): number {
  return stepsOfVisit(visit) / boughtTracksOf(visit).length
}

function hasBoughtSpree(visit: SpreeVisit): boolean {
  return UPGRADE_IDS.some((track) => visit.stepsBought[track] >= PACING_TARGETS.spree.spreeSteps)
}

function couldChainSpree(visit: SpreeVisit): boolean {
  return boughtTracksOf(visit).some(
    (track) => visit.capacity[track] >= PACING_TARGETS.spree.spreeSteps,
  )
}

/** The visits whose trip sold for more than the median trip. */
function aboveMedianIncome(visits: readonly SpreeVisit[]): SpreeVisit[] {
  const median = medianMoneyOf(visits.map((visit) => visit.income))
  if (median === null) return []
  return visits.filter((visit) => cmp(visit.income, median) > 0)
}

function medianMoneyOf(amounts: readonly Money[]): Money | null {
  if (amounts.length === 0) return null
  const sorted = [...amounts].sort(cmp)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return div(add(sorted[middle - 1], sorted[middle]), fromSafeInteger(2))
}

/** The lower middle of an even list, so a count of whole steps stays one the bot measured. */
function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** Whole steps as they are, a share of steps to one decimal. */
function stepsText(steps: number | null): string {
  if (steps === null) return '-'
  return Number.isInteger(steps) ? String(steps) : steps.toFixed(1)
}

function isWithin(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max
}

function rangeText(range: { min: number; max: number }): string {
  return `${range.min} to ${range.max}`
}
