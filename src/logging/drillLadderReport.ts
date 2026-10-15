/**
 * The drill-speed ladder's report (ticket 409): for each `drill_power` level the ladder cut, the
 * ticks and seconds the column took and its average cells/s; for each step up the ladder, how many
 * times faster it cut beside the drill law's own gain (#396: drillPower = 1.5 x 1.12^L, so a step
 * of n levels is 1.12^n). A step passes when it is faster and keeps the law's gain less the GD's
 * 5% tolerance (#396 ruling: each level is worth 1.12x +-5%, no dips). Speeds compare in Money,
 * so the verdict carries no float rounding; the text rounds to 3 places for the table only.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { DrillLadderRung } from '../systems/authority/drillLadder'
import { drillPower } from '../systems/economy/vehicleStats'
import { cmp, div, fromSafeInteger, mul, toFixedText, type Money } from '../systems/money'
import { formatNdjsonLine } from './ndjson'

/** The GD's ±5% on a level's 1.12x (#396), applied to a step's compounded law gain. */
export const LADDER_TOLERANCE_BP = 500
const BASIS_POINTS = 10_000
const PLACES = 3
const TICKS = fromSafeInteger(TICKS_PER_SECOND)

/** What the ladder cut and where: the first line of its NDJSON log. */
export interface LadderSetup {
  ladder: string
  planet: number
  worldSeed: number
  column: number
  cells: number
}

/** One step up the ladder, from the level below to the next one cut. */
export interface LadderStep {
  from: number
  to: number
  /** How many times faster `to` cut its column than `from`. */
  gain: Money
  /** `drillPower(to) / drillPower(from)`: the per-level 1.12x compounded over the step. */
  lawGain: Money
  isFaster: boolean
  isClearlyFelt: boolean
}

/** One level's line of the table and of the log, its rates as fixed-point text. */
export interface LadderRow {
  level: number
  cells: number
  ticks: number
  seconds: string
  cellsPerSecond: string
  /** Times faster than the level above it in the table; null on the first. */
  gainOnPrevious: string | null
  lawGainOnPrevious: string | null
}

export function ladderStepsOf(rungs: readonly DrillLadderRung[]): LadderStep[] {
  return rungs.slice(1).map((rung, index) => ladderStepOf(rungs[index], rung))
}

function ladderStepOf(lower: DrillLadderRung, upper: DrillLadderRung): LadderStep {
  const gain = div(cellsPerSecondOf(upper), cellsPerSecondOf(lower))
  const lawGain = div(drillPower(upper.level), drillPower(lower.level))
  return {
    from: lower.level,
    to: upper.level,
    gain,
    lawGain,
    isFaster: cmp(gain, fromSafeInteger(1)) > 0,
    isClearlyFelt: cmp(gain, feltFloorOf(lawGain)) >= 0,
  }
}

/** The law's gain less the tolerance: the least gain a player still feels as the curve's. */
function feltFloorOf(lawGain: Money): Money {
  const keptShare = div(
    fromSafeInteger(BASIS_POINTS - LADDER_TOLERANCE_BP),
    fromSafeInteger(BASIS_POINTS),
  )
  return mul(lawGain, keptShare)
}

function cellsPerSecondOf(rung: DrillLadderRung): Money {
  return div(mul(fromSafeInteger(rung.cells), TICKS), fromSafeInteger(rung.ticks))
}

export function ladderRowsOf(rungs: readonly DrillLadderRung[]): LadderRow[] {
  const steps = ladderStepsOf(rungs)
  return rungs.map((rung, index) => ladderRowOf(rung, index === 0 ? null : steps[index - 1]))
}

function ladderRowOf(rung: DrillLadderRung, step: LadderStep | null): LadderRow {
  return {
    level: rung.level,
    cells: rung.cells,
    ticks: rung.ticks,
    seconds: toFixedText(div(fromSafeInteger(rung.ticks), TICKS), PLACES),
    cellsPerSecond: toFixedText(cellsPerSecondOf(rung), PLACES),
    gainOnPrevious: step && toFixedText(step.gain, PLACES),
    lawGainOnPrevious: step && toFixedText(step.lawGain, PLACES),
  }
}

/** The ladder as a Markdown table under a line saying what was cut, for the test output. */
export function formatLadderTable(setup: LadderSetup, rungs: readonly DrillLadderRung[]): string {
  return [
    `Drill-speed ladder: planet ${setup.planet}, seed ${setup.worldSeed}, column ${setup.column}, ${setup.cells} cells straight down`,
    '| drill level | ticks | seconds | cells/s | x previous | law x previous |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    ...ladderRowsOf(rungs).map(formatLadderRow),
  ].join('\n')
}

function formatLadderRow(row: LadderRow): string {
  const cells = [row.level, row.ticks, row.seconds, row.cellsPerSecond]
  return `| ${[...cells, row.gainOnPrevious ?? '', row.lawGainOnPrevious ?? ''].join(' | ')} |`
}

/** The ladder's log: its setup line, then one line a level, for comparing runs across commits. */
export function ladderNdjsonOf(setup: LadderSetup, rungs: readonly DrillLadderRung[]): string {
  return [setup, ...ladderRowsOf(rungs)].map(formatNdjsonLine).join('')
}
