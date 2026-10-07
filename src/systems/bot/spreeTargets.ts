/**
 * The spree targets of #180 section 4 (Systems), judged on the pacing bot's Workshop visits
 * (`spreeCapacity.ts`): the median steps the bot's greedy plan buys a visit is 4 to 8, and of the
 * trips with above-median income, 25 to 40% leave `wallet - serviceReserve` enough for 10 or more
 * steps in a row on a track the bot buys at that visit (amendment 2: not the cheapest brass steps).
 * Levers, in order: `minorsPerMajor` 10, 12, 15 for the spree share; `minorStatShare` 0.5, 0.4, 0.3
 * for pace. Reported by `npm run balance:report`.
 */
import { PACING_TARGETS } from '../../constants/pacingTargets'
import { add, cmp, div, fromSafeInteger, type Money } from '../money'
import type { SpreeVisit } from './spreeCapacity'

export interface SpreeTargets {
  visits: number
  /** The median steps bought a visit; null with no visit. */
  medianStepsPerVisit: number | null
  /** Trips whose income is above the median trip's. */
  goodTrips: number
  /** Of those, the trips that could chain `spreeSteps` or more on a track the bot bought. */
  goodTripsWithSpree: number
}

export function spreeTargetsOf(visits: readonly SpreeVisit[]): SpreeTargets {
  const good = aboveMedianIncome(visits)
  return {
    visits: visits.length,
    medianStepsPerVisit: medianOf(visits.map((visit) => visit.stepsBought)),
    goodTrips: good.length,
    goodTripsWithSpree: good.filter(hasSpree).length,
  }
}

/** The share of good trips with a spree, in whole percent rounded down; null with none. */
export function spreePercentOf(targets: SpreeTargets): number | null {
  if (targets.goodTrips === 0) return null
  return Math.floor((100 * targets.goodTripsWithSpree) / targets.goodTrips)
}

/** The targets missed, as report lines; empty when both are met. */
export function spreeTargetMisses(targets: SpreeTargets): string[] {
  return [stepsPerVisitMiss(targets), spreeShareMiss(targets)].filter(
    (miss): miss is string => miss !== null,
  )
}

function stepsPerVisitMiss(targets: SpreeTargets): string | null {
  const range = PACING_TARGETS.spree.stepsPerVisit
  const median = targets.medianStepsPerVisit
  if (median !== null && isWithin(median, range)) return null
  return `median steps a visit ${median ?? 'none'}, target ${rangeText(range)}`
}

function spreeShareMiss(targets: SpreeTargets): string | null {
  const range = PACING_TARGETS.spree.spreePercent
  const percent = spreePercentOf(targets)
  if (percent !== null && isWithin(percent, range)) return null
  return `above-median trips with a spree ${percent ?? 'none'}%, target ${rangeText(range)}%`
}

export function spreeTargetsText(targets: SpreeTargets): string {
  const percent = spreePercentOf(targets)
  return [
    `${targets.visits} visits, median ${targets.medianStepsPerVisit ?? '-'} steps bought a visit`,
    `${targets.goodTripsWithSpree} of ${targets.goodTrips} above-median trips could chain ` +
      `${PACING_TARGETS.spree.spreeSteps}+ steps (${percent ?? '-'}%)`,
  ].join('; ')
}

function hasSpree(visit: SpreeVisit): boolean {
  return visit.boughtTracks.some(
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

/** The middle count, the lower middle of an even list, so it stays a whole number of steps. */
function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function isWithin(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max
}

function rangeText(range: { min: number; max: number }): string {
  return `${range.min} to ${range.max}`
}
