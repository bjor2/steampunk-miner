/**
 * The pace half of `balance:forks` (GD lock on #255, the Vertical Scaler's pins; ticket 267): on
 * each branch, planet 8 from arrival to core takes at least 45 minutes and the slice (planet 2's
 * core completed, from the start, as `balance:report` reads it) 100 to 110, both on the median of
 * the pacing seeds (#84); and a pair's two slice medians sit within 10% of each other. The 45 and
 * the 100-110 are #146's pins (docs/economy/pace-baseline.md), the 10% the lock's own.
 *
 * A run's pace is folded from the planet it is on and its tick after each step. A core never
 * completed is "never": it sorts after every time, so a median of never fails both floors and
 * bands.
 */
import { SLICE_LAST_PLANET } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { DomainEvent } from '../../../systems/authority/domainEvent'

export const FORK_PACE_PINS = {
  planet: 8,
  minPlanetMinutes: 45,
  sliceMinutes: { min: 100, max: 110 },
  /** The slower slice median at most 10% over the faster. */
  maxSliceSpreadPercent: 10,
} as const

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

export interface ForkPaceTally {
  arrivalTick: Map<number, number>
  coreTick: Map<number, number>
}

/** A branch's pace on one seed, in ticks; null for a core never completed. */
export interface ForkPace {
  sliceTicks: number | null
  planetTicks: number | null
}

export interface ForkPaceVerdict {
  branch: string
  medianSliceTicks: number | null
  medianPlanetTicks: number | null
  /** Planet 8 at or over its floor, the slice inside its band. */
  isPlanetSlowEnough: boolean
  isSliceInBand: boolean
}

export function emptyForkPaceTally(): ForkPaceTally {
  return { arrivalTick: new Map(), coreTick: new Map() }
}

/** The step's planet arrival and core completion, in place. */
export function tallyForkPaceStep(
  tally: ForkPaceTally,
  planet: number,
  tick: number,
  events: readonly DomainEvent[],
): void {
  if (!tally.arrivalTick.has(planet)) tally.arrivalTick.set(planet, tick)
  if (events.some((event) => event.type === 'CoreCompleted') && !tally.coreTick.has(planet)) {
    tally.coreTick.set(planet, tick)
  }
}

export function forkPaceOf(tally: ForkPaceTally): ForkPace {
  return {
    sliceTicks: tally.coreTick.get(SLICE_LAST_PLANET) ?? null,
    planetTicks: planetTicksOf(tally, FORK_PACE_PINS.planet),
  }
}

/** One branch's seeds held to the floor and the band. */
export function forkPaceVerdictOf(branch: string, paces: readonly ForkPace[]): ForkPaceVerdict {
  const medianSliceTicks = medianTicks(paces.map((pace) => pace.sliceTicks))
  const medianPlanetTicks = medianTicks(paces.map((pace) => pace.planetTicks))
  return {
    branch,
    medianSliceTicks,
    medianPlanetTicks,
    isPlanetSlowEnough: isAtLeastMinutes(medianPlanetTicks, FORK_PACE_PINS.minPlanetMinutes),
    isSliceInBand: isInsideMinutes(medianSliceTicks, FORK_PACE_PINS.sliceMinutes),
  }
}

/** Whether a pair's two slice medians are within 10% of each other; never with a never. */
export function areSliceMediansClose(first: ForkPaceVerdict, second: ForkPaceVerdict): boolean {
  const percent = FORK_PACE_PINS.maxSliceSpreadPercent
  return isSpreadWithin(first.medianSliceTicks, second.medianSliceTicks, percent)
}

/** The median of the seeds' times, a never sorting after every time. */
export function medianTicks(values: readonly (number | null)[]): number | null {
  const sorted = [...values].sort(byTicksThenNever)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

export function minutesOfTicks(ticks: number | null): string {
  return ticks === null ? 'never' : (ticks / TICKS_PER_MINUTE).toFixed(1)
}

function planetTicksOf(tally: ForkPaceTally, planet: number): number | null {
  const arrival = tally.arrivalTick.get(planet)
  const core = tally.coreTick.get(planet)
  return arrival === undefined || core === undefined ? null : core - arrival
}

function byTicksThenNever(a: number | null, b: number | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return a - b
}

function isAtLeastMinutes(ticks: number | null, minutes: number): boolean {
  return ticks !== null && ticks >= minutes * TICKS_PER_MINUTE
}

function isInsideMinutes(ticks: number | null, band: { min: number; max: number }): boolean {
  return isAtLeastMinutes(ticks, band.min) && isAtMostMinutes(ticks, band.max)
}

function isAtMostMinutes(ticks: number | null, minutes: number): boolean {
  return ticks !== null && ticks <= minutes * TICKS_PER_MINUTE
}

/** The larger at most `percent` over the smaller, in whole ticks. */
function isSpreadWithin(a: number | null, b: number | null, percent: number): boolean {
  if (a === null || b === null) return false
  return Math.max(a, b) * 100 <= Math.min(a, b) * (100 + percent)
}
