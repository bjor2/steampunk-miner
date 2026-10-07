/**
 * Mark spend beside Mark effect, per planet, in the run reports (#249; the Vertical Scaler on the
 * #157 gap review: the P3-P10 pins count Mark effects, with a Marks-off row next to each pin; #212
 * reads Mark spend against Mark effect). Derived from the log, never written into it (#223).
 *
 * - Mark research: the Mark nodes researched on the planet, and what they cost.
 * - uses above Mark 1: the power-up uses on the planet that acted at Mark 2 or more, by Mark.
 * - core with Marks · Marks off: the planet's core time (the pin) beside the same core with every
 *   item at Mark 1. A Mark changes a run only through a use of a Mark-bearing item (its cooldown,
 *   charges, draw or magnitude), so a run that researched no Mark, or used no power-up, before the
 *   core replays it unchanged with Marks off. Past that this run cannot tell, and the row says so.
 *
 * No item id is printed: some name a feature-unlock row (`grav_anchor`), which a report row may not.
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { derivePacingReport, minutesText, type PacingReport } from '../../logging/pacingReport'
import { formatAmount } from '../../systems/displayAmount'
import { add, fromCanonical, ZERO_MONEY, type Money } from '../../systems/money'

export const MARK_REPORT_ROWS: ReportRowSource = { id: 'power-up-core.marks', rowsOf: markRowsOf }

const NODE_UNLOCKED = 'tech-tree.tech_node_unlocked'
const POWER_UP_USED = 'power-up-core.power_up_used'
const FIRST_STEPPED_MARK = 2

/** A logged line's planet, tick and payload, read by name: slice lines are not kernel-typed. */
interface LoggedLine {
  event: string
  planet: number
  tick: number
  data: Readonly<Record<string, unknown>>
}

function markRowsOf(events: readonly RunEvent[], worldSeed: number, planet: number): ReportRow[] {
  const lines = events.map(loggedLineOf)
  return [
    markResearchRow(markResearchOn(lines, planet)),
    usesAboveMarkOneRow(usesAboveMarkOneOn(lines, planet)),
    ...coreRows(lines, derivePacingReport(events, worldSeed), planet),
  ]
}

function loggedLineOf(event: RunEvent): LoggedLine {
  const { planet, tick, data } = event
  return { event: event.event, planet, tick, data: data as LoggedLine['data'] }
}

function isMarkResearch(line: LoggedLine): boolean {
  return line.event === NODE_UNLOCKED && line.data.kind === 'mark'
}

function markResearchOn(lines: readonly LoggedLine[], planet: number): LoggedLine[] {
  return lines.filter((line) => line.planet === planet && isMarkResearch(line))
}

function markResearchRow(research: readonly LoggedLine[]): ReportRow {
  const spend = research
    .map((line) => fromCanonical(String(line.data.cost)))
    .reduce<Money>(add, ZERO_MONEY)
  return {
    label: 'Mark research (nodes · spend)',
    value: `${research.length} · ${formatAmount(spend)}`,
  }
}

function usesAboveMarkOneOn(lines: readonly LoggedLine[], planet: number): number[] {
  return lines
    .filter((line) => line.planet === planet && line.event === POWER_UP_USED)
    .map((line) => Number(line.data.mark))
    .filter((mark) => mark >= FIRST_STEPPED_MARK)
}

function usesAboveMarkOneRow(marks: readonly number[]): ReportRow {
  return { label: 'uses above Mark 1 (by Mark)', value: usesByMarkText(marks) }
}

function usesByMarkText(marks: readonly number[]): string {
  if (marks.length === 0) return 'none'
  const counts = new Map<number, number>()
  marks.forEach((mark) => counts.set(mark, (counts.get(mark) ?? 0) + 1))
  const byMark = [...counts]
    .sort(([a], [b]) => a - b)
    .map(([mark, count]) => `Mark ${mark} ×${count}`)
  return `${marks.length} (${byMark.join(', ')})`
}

/** The pin and its Marks-off time; none for a planet whose core the run never completed. */
function coreRows(lines: readonly LoggedLine[], pacing: PacingReport, planet: number): ReportRow[] {
  const coreTick = pacing.coreCompletedTick[String(planet)]
  const coreTicks = pacing.coreTicksOnPlanet[String(planet)]
  if (coreTick === undefined || coreTicks === undefined) return []
  return [
    {
      label: 'core with Marks · Marks off',
      value: `${minutesText(coreTicks)} · ${marksOffText(linesThrough(lines, coreTick), coreTicks)}`,
    },
  ]
}

function linesThrough(lines: readonly LoggedLine[], tick: number): LoggedLine[] {
  return lines.filter((line) => line.tick <= tick)
}

function marksOffText(before: readonly LoggedLine[], coreTicks: number): string {
  if (!before.some(isMarkResearch)) return `${minutesText(coreTicks)} (no Mark researched)`
  const uses = before.filter((line) => line.event === POWER_UP_USED).length
  if (uses === 0) return `${minutesText(coreTicks)} (no power-up used)`
  return `not this run (${uses} power-up uses with Marks researched)`
}
