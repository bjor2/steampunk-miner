/**
 * The median pacing report of one scenario played on several world seeds (#84, Game Director: the
 * slice band, the planet 1 core and the assay gate are judged on the median of three seeded runs,
 * so one run's combat deaths cannot flip a gate). Each metric is its own median, the middle value
 * of the runs. A tick that never came (null, or a core missing from a run) counts as later than any
 * tick; a count missing from a run counts as 0.
 */
import { derivePacingReport, minutesText, type PacingReport } from './pacingReport'
import type { RunEvent } from './runEvent'

/** One seed's run, as the per-seed rows of the balance report print it. */
export interface SeededPacingReport {
  worldSeed: number
  report: PacingReport
}

export function medianPacingReport(reports: readonly PacingReport[]): PacingReport {
  return {
    firstSaleTick: medianTickOf(reports.map((report) => report.firstSaleTick)),
    firstUpgradeTick: medianTickOf(reports.map((report) => report.firstUpgradeTick)),
    upgradesByEarlyCheck: medianCountOf(reports.map((report) => report.upgradesByEarlyCheck)),
    tracksByEarlyCheck: medianCountOf(reports.map((report) => report.tracksByEarlyCheck)),
    deepestBandByEarlyCheck: medianCountOf(reports.map((report) => report.deepestBandByEarlyCheck)),
    coreCompletedTick: medianTicksByKey(reports.map((report) => report.coreCompletedTick)),
    coreTicksOnPlanet: medianTicksByKey(reports.map((report) => report.coreTicksOnPlanet)),
    sliceEndTick: medianTickOf(reports.map((report) => report.sliceEndTick)),
    tripsByPlanet: medianCountsByKey(reports.map((report) => report.tripsByPlanet)),
    finalLevels: medianCountsByKey(reports.map((report) => report.finalLevels)),
    rescuesByCause: medianCountsByKey(reports.map((report) => report.rescuesByCause)),
  }
}

/** The middle of the sorted values; with an even count, the later of the two middle ones. */
function medianTickOf(ticks: readonly (number | null)[]): number | null {
  const sorted = [...ticks].sort(compareTicksNeverLast)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function compareTicksNeverLast(a: number | null, b: number | null): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null)
  return a - b
}

function medianCountOf(counts: readonly number[]): number {
  const sorted = [...counts].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function medianTicksByKey(records: readonly Record<string, number>[]): Record<string, number> {
  const entries = keysOf(records).map((key) => [key, medianTickOf(ticksAt(records, key))] as const)
  return Object.fromEntries(entries.filter(isReachedEntry))
}

function ticksAt(records: readonly Record<string, number>[], key: string): (number | null)[] {
  return records.map((record) => record[key] ?? null)
}

function isReachedEntry(
  entry: readonly [string, number | null],
): entry is readonly [string, number] {
  return entry[1] !== null
}

function medianCountsByKey(records: readonly Record<string, number>[]): Record<string, number> {
  return Object.fromEntries(
    keysOf(records).map((key) => [key, medianCountOf(records.map((record) => record[key] ?? 0))]),
  )
}

function keysOf(records: readonly Record<string, number>[]): string[] {
  return [...new Set(records.flatMap((record) => Object.keys(record)))]
}

/**
 * Each seed's planet 1 core, planet 2 core (from arrival), slice end, rescues and final drill and
 * tip levels, then the median row the gates judge (#84 closing table).
 */
export function formatSeedPacingTable(runs: readonly SeededPacingReport[]): string {
  const median = medianPacingReport(runs.map((run) => run.report))
  const rows = [
    ...runs.map((run) => seedRowOf(String(run.worldSeed), run.report)),
    seedRowOf('median', median),
  ]
  return [
    '| world seed | planet 1 core | planet 2 core (on the planet) | slice end | rescues | drill / tip levels |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function seedRowOf(label: string, report: PacingReport): string {
  const cells = [
    label,
    optionalMinutesText(report.coreCompletedTick['1']),
    optionalMinutesText(report.coreTicksOnPlanet['2']),
    optionalMinutesText(report.sliceEndTick ?? undefined),
    String(rescueCountOf(report)),
    `${report.finalLevels.drill_power ?? 0} / ${report.finalLevels.drill_tip ?? 0}`,
  ]
  return `| ${cells.join(' | ')} |`
}

function optionalMinutesText(ticks: number | undefined): string {
  return ticks === undefined ? 'never' : minutesText(ticks)
}

function rescueCountOf(report: PacingReport): number {
  return Object.values(report.rescuesByCause).reduce((total, count) => total + count, 0)
}

/** Each seed's pacing report, derived from its run's events on its own world seed. */
export function seededPacingReportsOf(
  runs: readonly { worldSeed: number; events: readonly RunEvent[] }[],
): SeededPacingReport[] {
  return runs.map(({ worldSeed, events }) => ({
    worldSeed,
    report: derivePacingReport(events, worldSeed),
  }))
}
