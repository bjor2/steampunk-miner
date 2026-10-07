/**
 * The slices' report rows of one run (#223): every registered source asked for each planet the run
 * logged, in planet then source-id order. A row that names a feature-unlock id is refused with the
 * run, never trimmed: unlocks are reported by stats.json and `feature_unlocked` alone.
 */
import { LOCKED_SCHEDULE, unlockIdNamedIn } from '../systems/unlocks/unlockSchedule'
import { reportRowSources, type ReportRow, type ReportRowSource } from './registries/reportRows'
import type { RunEvent } from './runEvent'

export interface PlanetReportRow extends ReportRow {
  planet: number
  sourceId: string
}

/** A run log and the world seed it was played on. */
export interface SeededRunLog {
  worldSeed: number
  events: readonly RunEvent[]
}

export class ReportRowRefusedError extends Error {}

export function reportRowsOfRun({ worldSeed, events }: SeededRunLog): PlanetReportRow[] {
  return planetsOfRun(events).flatMap((planet) =>
    reportRowSources().flatMap((source) => rowsOfSource(source, { worldSeed, events }, planet)),
  )
}

/** One Markdown list line per row of every run, for the balance report. */
export function reportRowLines(runs: readonly SeededRunLog[]): string[] {
  return runs.flatMap((run) => reportRowsOfRun(run).map((row) => reportRowLine(run, row)))
}

function reportRowLine({ worldSeed }: SeededRunLog, row: PlanetReportRow): string {
  return `seed ${worldSeed} · planet ${row.planet} · ${row.sourceId} · ${row.label}: ${row.value}`
}

/** The planets the run's lines were logged on, lowest first. */
function planetsOfRun(events: readonly RunEvent[]): number[] {
  return [...new Set(events.map((event) => event.planet))].sort((a, b) => a - b)
}

function rowsOfSource(
  source: ReportRowSource,
  { worldSeed, events }: SeededRunLog,
  planet: number,
): PlanetReportRow[] {
  return source
    .rowsOf(events, worldSeed, planet)
    .map((row) => ({ planet, sourceId: source.id, ...checkedRow(source, row) }))
}

function checkedRow(source: ReportRowSource, row: ReportRow): ReportRow {
  const unlockId = unlockIdNamedBy(row)
  if (unlockId !== undefined) refuseUnlockRow(source, unlockId)
  return { label: row.label, value: row.value }
}

/** The first feature-unlock id written as a word of the row's label or value. */
function unlockIdNamedBy({ label, value }: ReportRow): string | undefined {
  return unlockIdNamedIn(LOCKED_SCHEDULE, `${label} ${value}`)
}

function refuseUnlockRow(source: ReportRowSource, unlockId: string): never {
  throw new ReportRowRefusedError(
    `report row source "${source.id}" names the feature-unlock id "${unlockId}": unlocks are ` +
      'reported by stats.json and feature_unlocked',
  )
}
