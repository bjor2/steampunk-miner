/**
 * The vehicle's heat gauge (spec #113 design and numbers): 0 to the archetype's `gaugeMax` points,
 * held in integer units (`HEAT_UNITS_PER_POINT`). Time is split into segments of constant rate (the
 * drilling ticks of a report, then the rest), each a signed whole number of units per tick, so the
 * gauge, the ticks spent at its max and the lines it crosses are exact and replay the same. Per
 * vehicle; the save holds the level and the tick it was settled at.
 */
import { BASIS_POINTS, HEAT_UNITS_PER_POINT } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ceil, div, fromSafeInteger, mul, toSafeInteger, type BigStat } from '../money'

export interface VehicleHeat {
  /** Heat units, 0 to the gauge's max. */
  level: number
  /** The tick the level was worked out to. */
  settledTick: number
  /** The tick of the last lava touch that hurt; none hurts within the hit grace of it (#113). */
  lavaTouchTick: number | null
}

export function coldHeatAt(tick: number): VehicleHeat {
  return { level: 0, settledTick: tick, lavaTouchTick: null }
}

/** A stretch of ticks at one rate, in signed units per tick. */
export interface HeatSegment {
  ticks: number
  unitsPerTick: number
}

/**
 * An instant vent between segments (ticket 233, a slice's heat sink): the gauge keeps `keepBp`
 * basis points of its level, rounded down.
 */
export interface HeatVent {
  keepBp: number
}

export type HeatStep = HeatSegment | HeatVent

/** Where a segment leaves the gauge: its level, the ticks it sat at the max, the lines it crossed. */
export interface HeatRun {
  level: number
  ticksAtMax: number
  /** Gauge lines (in units) crossed going up, and going down, in the order crossed. */
  risenPast: number[]
  fellBelow: number[]
}

const UNITS_PER_POINT = fromSafeInteger(HEAT_UNITS_PER_POINT)
const TICKS = fromSafeInteger(TICKS_PER_SECOND)

/** A per-second rate in gauge points as whole units per tick, rounded up. */
export function heatUnitsPerTickOf(pointsPerSecond: BigStat): number {
  return toSafeInteger(ceil(div(mul(pointsPerSecond, UNITS_PER_POINT), TICKS)))
}

export function heatUnitsOfPoints(points: number): number {
  return points * HEAT_UNITS_PER_POINT
}

/** The gauge level in points, for the drill's throttle and the HUD. */
export function heatPointsOf(units: number): BigStat {
  return div(fromSafeInteger(units), UNITS_PER_POINT)
}

/** Runs the steps in order from `level`, held to `0..maxUnits`, watching `lines`. */
export function runHeatSegments(
  level: number,
  steps: readonly HeatStep[],
  maxUnits: number,
  lines: readonly number[],
): HeatRun {
  return steps.reduce<HeatRun>(
    (run, step) => joinRuns(run, runStep(run.level, step, maxUnits, lines)),
    { level, ticksAtMax: 0, risenPast: [], fellBelow: [] },
  )
}

function runStep(
  level: number,
  step: HeatStep,
  maxUnits: number,
  lines: readonly number[],
): HeatRun {
  return isVent(step) ? runVent(level, step, lines) : runSegment(level, step, maxUnits, lines)
}

function isVent(step: HeatStep): step is HeatVent {
  return 'keepBp' in step
}

function runVent(level: number, { keepBp }: HeatVent, lines: readonly number[]): HeatRun {
  const after = Math.floor((level * keepBp) / BASIS_POINTS)
  return {
    level: after,
    ticksAtMax: 0,
    risenPast: [],
    fellBelow: lines.filter((line) => level >= line && after < line),
  }
}

function runSegment(
  level: number,
  { ticks, unitsPerTick }: HeatSegment,
  maxUnits: number,
  lines: readonly number[],
): HeatRun {
  const after = Math.min(maxUnits, Math.max(0, level + unitsPerTick * ticks))
  return {
    level: after,
    ticksAtMax: ticksAtMaxOf(level, ticks, unitsPerTick, maxUnits),
    risenPast: lines.filter((line) => level < line && after >= line),
    fellBelow: lines.filter((line) => level >= line && after < line),
  }
}

/** A rising gauge sits at the max from the tick it reaches it; a steady full one all along. */
function ticksAtMaxOf(level: number, ticks: number, unitsPerTick: number, maxUnits: number) {
  if (unitsPerTick < 0) return 0
  if (level >= maxUnits) return ticks
  if (unitsPerTick === 0) return 0
  const toMax = Math.ceil((maxUnits - level) / unitsPerTick)
  return Math.max(0, ticks - toMax)
}

function joinRuns(first: HeatRun, second: HeatRun): HeatRun {
  return {
    level: second.level,
    ticksAtMax: first.ticksAtMax + second.ticksAtMax,
    risenPast: [...first.risenPast, ...second.risenPast],
    fellBelow: [...first.fellBelow, ...second.fellBelow],
  }
}
