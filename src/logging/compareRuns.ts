/**
 * `compareRuns(a, b)` (decision #11 section 3, design doc sections 26 and 28): two run summaries
 * side by side, as the numbers a balance change moves: time to each planet and core, each planet's
 * band-1 and band-5 dig time on arrival and at departure (the #81 sawtooth, #86), the firsts, income per
 * minute, spending by kind, deaths and the final level of every track. Differences are
 * reported, never judged: only the pacing targets fail a build (#29).
 *
 * Runs with different `logSchemaVersion`s are refused (no adapter exists yet), and so, unless the
 * caller asks for `compareRunsIncludingDebug`, is a run in which a `debug.*` command was applied:
 * its numbers were not played for.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { formatAmount } from '../systems/displayAmount'
import {
  cmp,
  div,
  floorMilli,
  fromCanonical,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import { SAWTOOTH_BAND } from '../systems/vehicle/bandDig'
import { digText, type BandDig } from './bandDigReport'
import type { RunSummary } from './runSummary'

export interface ComparisonRow {
  metric: string
  a: string
  b: string
  change: string
}

export type RunComparison = { ok: true; rows: ComparisonRow[] } | { ok: false; problems: string[] }

type Quantity =
  | { kind: 'ticks'; value: number | null }
  | { kind: 'count'; value: number }
  | { kind: 'money'; value: Money }
  | { kind: 'digTicks'; value: number | null }

interface Metric {
  name: string
  read: (summary: RunSummary) => Quantity
}

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

export function compareRuns(a: RunSummary, b: RunSummary): RunComparison {
  const problems = [...schemaProblems(a, b), ...debugProblems(a), ...debugProblems(b)]
  return problems.length > 0 ? { ok: false, problems } : { ok: true, rows: comparisonRows(a, b) }
}

/** The same comparison for runs set up by scenarios or debug commands, said so by the caller. */
export function compareRunsIncludingDebug(a: RunSummary, b: RunSummary): RunComparison {
  const problems = schemaProblems(a, b)
  return problems.length > 0 ? { ok: false, problems } : { ok: true, rows: comparisonRows(a, b) }
}

function schemaProblems(a: RunSummary, b: RunSummary): string[] {
  if (a.logSchemaVersion === b.logSchemaVersion) return []
  return [
    `${a.runId} has logSchemaVersion ${a.logSchemaVersion} and ${b.runId} has ` +
      `${b.logSchemaVersion}; no adapter exists between them`,
  ]
}

function debugProblems(summary: RunSummary): string[] {
  if (summary.debugCommandsApplied === 0) return []
  return [`${summary.runId} applied ${summary.debugCommandsApplied} debug commands`]
}

function comparisonRows(a: RunSummary, b: RunSummary): ComparisonRow[] {
  return metricsFor(a, b).map((metric) => rowOf(metric, a, b))
}

/** The section 26 list, with one row per planet reached and per track in either run. */
function metricsFor(a: RunSummary, b: RunSummary): Metric[] {
  return [
    ...keysOfEither(a.milestones.planetReached, b.milestones.planetReached).map(planetMetric),
    ...keysOfEither(a.coreCompletedTicks, b.coreCompletedTicks).map(coreMetric),
    ...bandDigMetricsFor(a, b),
    ...FIXED_METRICS,
    ...keysOfEither(a.upgradeLevels, b.upgradeLevels).map(levelMetric),
  ]
}

function keysOfEither(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) =>
    x.localeCompare(y, 'en', { numeric: true }),
  )
}

function planetMetric(planet: string): Metric {
  return {
    name: `time to planet ${planet}`,
    read: (summary) => ticks(summary.milestones.planetReached[planet] ?? null),
  }
}

function coreMetric(planet: string): Metric {
  return {
    name: `planet ${planet} core completed`,
    read: (summary) => ticks(summary.coreCompletedTicks[planet] ?? null),
  }
}

/** The summary fields that hold a band's dig time per planet, and the band each one measures. */
const BAND_DIG_FIELDS = [
  { field: 'firstBandDigTicks', band: 1 },
  { field: 'sawtoothBandDigTicks', band: SAWTOOTH_BAND },
] as const

type BandDigField = (typeof BAND_DIG_FIELDS)[number]

function bandDigMetricsFor(a: RunSummary, b: RunSummary): Metric[] {
  return BAND_DIG_FIELDS.flatMap((source) =>
    keysOfEither(bandDigsOf(a, source), bandDigsOf(b, source)).flatMap((planet) =>
      bandDigMetrics(source, planet),
    ),
  )
}

/** A `summary.json` written before #86 has no band dig times; it compares as none. */
function bandDigsOf(summary: RunSummary, source: BandDigField): Partial<Record<string, BandDig>> {
  return (summary as Partial<RunSummary>)[source.field] ?? {}
}

function bandDigMetrics(source: BandDigField, planet: string): Metric[] {
  const digOf = (summary: RunSummary, when: keyof BandDig): Quantity => ({
    kind: 'digTicks',
    value: bandDigsOf(summary, source)[planet]?.[when] ?? null,
  })
  return [
    {
      name: `planet ${planet} band ${source.band} dig on arrival`,
      read: (summary) => digOf(summary, 'arrival'),
    },
    {
      name: `planet ${planet} band ${source.band} dig at departure`,
      read: (summary) => digOf(summary, 'departure'),
    },
  ]
}

function levelMetric(upgradeId: string): Metric {
  return {
    name: `${upgradeId} level`,
    read: (summary) => count(summary.upgradeLevels[upgradeId] ?? 0),
  }
}

const ticks = (value: number | null): Quantity => ({ kind: 'ticks', value })
const count = (value: number): Quantity => ({ kind: 'count', value })
const money = (text: string): Quantity => ({ kind: 'money', value: fromCanonical(text) })

const FIXED_METRICS: readonly Metric[] = [
  { name: 'run length', read: (summary) => ticks(summary.durationTicks) },
  { name: 'time to first sale', read: (summary) => ticks(summary.milestones.firstSale) },
  { name: 'time to first upgrade', read: (summary) => ticks(summary.milestones.firstUpgrade) },
  { name: 'time to first death', read: (summary) => ticks(summary.milestones.firstDeath) },
  { name: 'income per minute', read: (summary) => incomePerMinute(summary) },
  { name: 'money earned', read: (summary) => money(summary.moneyEarned) },
  { name: 'money spent', read: (summary) => money(summary.moneySpent) },
  { name: 'spent on upgrades', read: (summary) => money(summary.upgradeSpending) },
  { name: 'spent on repairs', read: (summary) => money(summary.repairSpending) },
  { name: 'spent on charging', read: (summary) => money(summary.chargingSpending) },
  { name: 'rescue fees', read: (summary) => money(summary.rescueFees) },
  { name: 'spent on lining', read: (summary) => money(summary.liningSpending) },
  { name: 'lining charged', read: (summary) => money(summary.liningCharged) },
  { name: 'lining forgiven', read: (summary) => money(summary.liningForgiven) },
  { name: 'upgrades bought', read: (summary) => count(summary.upgradesPurchased) },
  { name: 'tiles destroyed', read: (summary) => count(summary.tilesDestroyed) },
  { name: 'enemies killed', read: (summary) => count(summary.enemiesKilled) },
  { name: 'vehicle deaths', read: (summary) => count(summary.vehicleDeaths) },
]

function incomePerMinute(summary: RunSummary): Quantity {
  if (summary.durationTicks === 0) return money('0')
  const minutes = div(fromSafeInteger(summary.durationTicks), fromSafeInteger(TICKS_PER_MINUTE))
  // Shown to the money quantum (0.001, #20), like every amount the formatter prints.
  return { kind: 'money', value: floorMilli(div(fromCanonical(summary.moneyEarned), minutes)) }
}

function rowOf(metric: Metric, a: RunSummary, b: RunSummary): ComparisonRow {
  const before = metric.read(a)
  const after = metric.read(b)
  return {
    metric: metric.name,
    a: quantityText(before),
    b: quantityText(after),
    change: changeText(before, after),
  }
}

function quantityText(quantity: Quantity): string {
  if (quantity.kind === 'money') return formatAmount(quantity.value)
  if (quantity.kind === 'count') return String(quantity.value)
  if (quantity.kind === 'digTicks') return digText(quantity.value)
  return quantity.value === null ? 'never' : minutesText(quantity.value)
}

function changeText(before: Quantity, after: Quantity): string {
  if (before.kind === 'money' && after.kind === 'money')
    return moneyChange(before.value, after.value)
  if (before.kind === 'count' && after.kind === 'count') return signed(after.value - before.value)
  if (before.kind === 'ticks' && after.kind === 'ticks')
    return tickChange(before.value, after.value)
  if (before.kind === 'digTicks' && after.kind === 'digTicks')
    return digChange(before.value, after.value)
  return 'n/a'
}

function tickChange(before: number | null, after: number | null): string {
  if (before === null || after === null) return before === after ? '0' : 'n/a'
  const difference = after - before
  return `${difference < 0 ? '-' : '+'}${minutesText(Math.abs(difference))}${percentText(difference, before)}`
}

function digChange(before: number | null, after: number | null): string {
  if (before === null || after === null) return before === after ? '0' : 'n/a'
  const difference = after - before
  return `${difference < 0 ? '-' : '+'}${digText(Math.abs(difference))}${percentText(difference, before)}`
}

function moneyChange(before: Money, after: Money): string {
  const difference = sub(after, before)
  const isLess = cmp(difference, ZERO_MONEY) < 0
  const magnitude = isLess ? sub(ZERO_MONEY, difference) : difference
  return `${isLess ? '-' : '+'}${formatAmount(magnitude)}${moneyPercentText(difference, before)}`
}

/** Display only: a ratio of two Money values, as a whole percent. */
function moneyPercentText(difference: Money, before: Money): string {
  if (cmp(before, ZERO_MONEY) === 0) return ''
  const percent = Number.parseFloat(toCanonical(mul(div(difference, before), fromSafeInteger(100))))
  return ` (${percent >= 0 ? '+' : ''}${percent.toFixed(0)}%)`
}

function percentText(difference: number, before: number): string {
  if (before === 0) return ''
  const percent = (difference * 100) / before
  return ` (${percent >= 0 ? '+' : ''}${percent.toFixed(0)}%)`
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function minutesText(tickCount: number): string {
  return `${(tickCount / TICKS_PER_MINUTE).toFixed(1)} min`
}

/** The comparison as a Markdown table, headed by the two runs' labels. */
export function formatComparisonTable(rows: readonly ComparisonRow[], labels: [string, string]) {
  return [
    `| metric | ${labels[0]} | ${labels[1]} | change |`,
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.metric} | ${row.a} | ${row.b} | ${row.change} |`),
  ].join('\n')
}
