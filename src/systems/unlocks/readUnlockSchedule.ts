/**
 * Reads the Horizontal Scaler's locked schedule (`docs/scaling/horizontal/stats.json`) into
 * unlock rows of the #79 shape. The file is refused whole and every problem listed, like the
 * economy file and scenarios (CLAUDE.md "refused, never trimmed"); an unlocked file, or one whose
 * `source_hash` is not the pinned lock (#80, #90 pins), is refused too.
 */
import { createFieldReader, readLiteral, type FieldReader } from '../economy/economyFieldReader'

/** Schedule C cache lanes (#79). */
export const UNLOCK_LANES = [
  'Facility',
  'Upgrade',
  'Enemy',
  'Environment',
  'Unique item',
  'Feature',
  'Merchant',
] as const
export const PROGRESSION_AXES = ['horizontal', 'vertical', 'mixed'] as const
/** Lifecycle (#79): only `planned` and later may enter a build plan. */
export const UNLOCK_STATUSES = ['vision', 'planned', 'building', 'shipped', 'cut'] as const
/** How a row becomes true at runtime (#79 `bind`). */
export const UNLOCK_BINDS = ['planet_gate', 'artefact', 'facility', 'manual'] as const

export type UnlockLane = (typeof UNLOCK_LANES)[number]
export type ProgressionAxis = (typeof PROGRESSION_AXES)[number]
export type UnlockStatus = (typeof UNLOCK_STATUSES)[number]
export type UnlockBind = (typeof UNLOCK_BINDS)[number]

export interface UnlockRow {
  /** Stable snake_case key across the cache, tickets and runtime. */
  id: string
  name: string
  /** Earliest planet the unlock may appear on; campaign 1..40, endless 41+. */
  planetIndex: number
  lane: UnlockLane
  progressionAxis: ProgressionAxis
  status: UnlockStatus
  bind: UnlockBind
  /** How many picks the row stands for (artefact sets); 1 when the file omits it. */
  count: number
}

export interface UnlockSchedule {
  sourceHash: string
  rows: readonly UnlockRow[]
}

export type UnlockScheduleReading =
  { schedule: UnlockSchedule; problems: [] } | { problems: string[] }

const SNAKE_CASE_ID = /^[a-z][a-z0-9_]*$/

export function readUnlockSchedule(raw: unknown, pinnedSourceHash: string): UnlockScheduleReading {
  const reader = createFieldReader()
  const schedule = readScheduleFields(reader, reader.object('schedule', raw), pinnedSourceHash)
  return reader.problems.length > 0 ? { problems: reader.problems } : { schedule, problems: [] }
}

function readScheduleFields(
  reader: FieldReader,
  file: Record<string, unknown>,
  pinnedSourceHash: string,
): UnlockSchedule {
  checkLocked(reader, file.schedule_locked)
  const sourceHash = readPinnedSourceHash(reader, file.source_hash, pinnedSourceHash)
  const rows = reader
    .list('features', file.features)
    .map((row, index) => readRow(reader, `features[${index}]`, row))
  checkUniqueIds(reader, rows)
  return { sourceHash, rows }
}

function checkLocked(reader: FieldReader, scheduleLocked: unknown): void {
  if (scheduleLocked !== true) reader.record('schedule_locked must be true')
}

function readPinnedSourceHash(reader: FieldReader, value: unknown, pinned: string): string {
  const sourceHash = reader.text('source_hash', value)
  if (sourceHash !== pinned) {
    reader.record(`source_hash must be the pinned lock ${pinned}, got ${JSON.stringify(value)}`)
  }
  return sourceHash
}

function readRow(reader: FieldReader, path: string, value: unknown): UnlockRow {
  const row = reader.object(path, value)
  return {
    id: readId(reader, `${path}.id`, row.id),
    name: reader.text(`${path}.name`, row.name),
    planetIndex: readPositiveInteger(reader, `${path}.planetIndex`, row.planetIndex),
    lane: readLiteral(reader, `${path}.lane`, row.lane, UNLOCK_LANES),
    progressionAxis: readLiteral(
      reader,
      `${path}.progressionAxis`,
      row.progressionAxis,
      PROGRESSION_AXES,
    ),
    status: readLiteral(reader, `${path}.status`, row.status, UNLOCK_STATUSES),
    bind: readLiteral(reader, `${path}.bind`, row.bind, UNLOCK_BINDS),
    count: row.count === undefined ? 1 : readPositiveInteger(reader, `${path}.count`, row.count),
  }
}

function readId(reader: FieldReader, path: string, value: unknown): string {
  const id = reader.text(path, value)
  if (typeof value === 'string' && !SNAKE_CASE_ID.test(id)) {
    reader.record(`${path} must be snake_case, got ${JSON.stringify(id)}`)
  }
  return id
}

function readPositiveInteger(reader: FieldReader, path: string, value: unknown): number {
  const integer = reader.safeInteger(path, value)
  if (Number.isSafeInteger(value) && integer < 1) reader.record(`${path} must be at least 1`)
  return integer
}

function checkUniqueIds(reader: FieldReader, rows: readonly UnlockRow[]): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) reader.record(`features id ${JSON.stringify(row.id)} appears twice`)
    seen.add(row.id)
  }
}
