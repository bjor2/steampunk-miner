/**
 * The drill-speed ladder's report (ticket 409): for each `drill_power` level the ladder cut, the
 * ticks and seconds the column took and its average cells/s; for each step up the ladder, how many
 * times faster it cut beside the drill law's own gain. A level is one purchase since the GD ruling
 * on #551 (ticket 552): `D(n) = 1.5 x 1.12^(1/18) x 1.243^(n-1)`. A step passes when it is faster
 * and gains 1.181 to 1.305 a purchase climbed, compounded (GD point 4, the #463 bar in place of
 * #396's 1.12x +-5% a level). Speeds compare in Money, so the verdict carries no float rounding;
 * the text rounds to 3 places for the table only.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { DrillLadderRung } from '../systems/authority/drillLadder'
import { drillPower } from '../systems/economy/vehicleStats'
import {
  cmp,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  powInt,
  toFixedText,
  type Money,
} from '../systems/money'
import { formatNdjsonLine } from './ndjson'

/** What one purchase must gain, 1.243 +-5% (GD ruling on #551, point 4). */
export const PURCHASE_GAIN_BAND = {
  lowest: fromCanonical('1.181'),
  highest: fromCanonical('1.305'),
}
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
  /** `drillPower(to) / drillPower(from)`: the law's 1.243 a purchase compounded over the step. */
  lawGain: Money
  isFaster: boolean
  /** Whether `gain` is inside the purchase band compounded over the purchases climbed. */
  isInPurchaseBand: boolean
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
  return {
    from: lower.level,
    to: upper.level,
    gain,
    lawGain: div(drillPower(upper.level), drillPower(lower.level)),
    isFaster: cmp(gain, fromSafeInteger(1)) > 0,
    isInPurchaseBand: isInPurchaseBand(gain, upper.level - lower.level),
  }
}

/** `lowest^k <= gain <= highest^k` over `k` purchases climbed. */
function isInPurchaseBand(gain: Money, purchases: number): boolean {
  const lowest = powInt(PURCHASE_GAIN_BAND.lowest, purchases)
  const highest = powInt(PURCHASE_GAIN_BAND.highest, purchases)
  return cmp(gain, lowest) >= 0 && cmp(gain, highest) <= 0
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

/** The schema of a ladder history row (scripts/ci/drillLadderHistory.mjs checks it). */
export const LADDER_HISTORY_SCHEMA = 1

/**
 * One level of one ladder run as the status page's Drill speed panel keeps it (ticket 434): the
 * row of the table with what was cut and when, so runs append to drill-ladder.ndjson on the
 * test-metrics branch and trend over commits. The id is unique per run and level.
 */
export interface LadderHistoryRow extends LadderRow {
  schema: number
  id: string
  measuredAt: string
  ladder: string
  planet: number
  worldSeed: number
  column: number
  /** The level cut before this one in the same run; null on the first. */
  previousLevel: number | null
}

/** The history rows of one ladder run measured at `measuredAt` (an ISO time). */
export function ladderHistoryRowsOf(
  setup: LadderSetup,
  rungs: readonly DrillLadderRung[],
  measuredAt: string,
): LadderHistoryRow[] {
  return ladderRowsOf(rungs).map((row, index) => ({
    schema: LADDER_HISTORY_SCHEMA,
    id: `${measuredAt}-${setup.ladder}-L${row.level}`,
    measuredAt,
    ladder: setup.ladder,
    planet: setup.planet,
    worldSeed: setup.worldSeed,
    column: setup.column,
    previousLevel: index === 0 ? null : rungs[index - 1].level,
    ...row,
  }))
}
