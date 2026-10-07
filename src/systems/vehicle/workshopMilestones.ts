/**
 * The Workshop's milestone majors (#180 Progression and the GD lock on #177; data ticket 228):
 * the few big level-ups per track that bring a new behaviour and a visible change on the miner,
 * keyed on the track's major level `L`. The list is `src/data/workshop/milestones.json`, seeded
 * from Gameplay & Vehicle's 12 rows (majors 1 and 2 on each track, swapping among the tier 1-3
 * parts the vehicle already ships); new rows are data, not code. The workshop slice reads it to
 * end a held chain on a milestone and to star the next one; each behaviour id names the ticket
 * that plays its beat, once, on the major's 36-tick pause, turning the changed part to the camera.
 *
 * Horizontal Scaler guard: a milestone never grants a stats.json feature. A row that upgrades a
 * scheduled feature names it as `featureId` and is owned only once `FeatureUnlocked` has fired
 * for that row, so nothing is unlocked early; vision rows never unlock, so they stay hidden. A
 * milestone is otherwise owned when `floor(m / n) >= L` (#180: no new save data).
 */
import SHIPPED_MILESTONES from '../../data/workshop/milestones.json'
import { isVehiclePartId, tierOfPartId } from '../art/artIds'
import type { PartsSidecar } from '../art/partsSidecar'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { createFieldReader, readLiteral, type FieldReader } from '../economy/economyFieldReader'
import { isMajorStep, majorOf, type TrackNumbers } from '../economy/upgradeSteps'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

/** The behaviours G&V named on #177; each is built by its own ticket. */
export const MILESTONE_BEHAVIOUR_IDS = [
  'motion.bit_spin_flourish',
  'motion.hopper_tip',
  'motion.piston_pump',
  'swap.part',
] as const

export type MilestoneBehaviourId = (typeof MILESTONE_BEHAVIOUR_IDS)[number]

export interface WorkshopMilestone {
  track: UpgradeId
  /** The track's major level `L` that owns it. */
  major: number
  behaviour: MilestoneBehaviourId
  /** Parts of the `vehicle` asset: swapped in by `swap.part`, posed by a `motion.*`. */
  partIds: readonly string[]
  /** The locked-schedule row this milestone upgrades, never unlocks; null for a track's own part. */
  featureId: string | null
}

/** Whether a locked-schedule row has had its `FeatureUnlocked` (the authority's `isFeatureUnlocked`). */
export type FeatureUnlockedQuery = (featureId: string) => boolean

/** A swap must change the silhouette (#180 G&V), so it never swaps a tier-1 part back in. */
const BASE_TIER = 1

export const WORKSHOP_MILESTONES: readonly WorkshopMilestone[] =
  loadWorkshopMilestones(SHIPPED_MILESTONES)

/** Every problem with a raw milestone file; empty when it can ship. */
export function workshopMilestoneProblems(raw: unknown): string[] {
  const reader = createFieldReader()
  const rows = readRows(reader, raw)
  checkOneRowPerMajor(reader, rows)
  return reader.problems
}

/** Rows naming a part the vehicle's sidecar does not ship. */
export function milestonePartProblems(
  rows: readonly WorkshopMilestone[],
  sidecar: PartsSidecar,
): string[] {
  const shipped = sidecar.parts.map((part) => part.id)
  return rows.flatMap((row) =>
    row.partIds
      .filter((partId) => !shipped.includes(partId))
      .map((partId) => `${labelOf(row)} names ${partId}, which ${sidecar.assetId} does not ship`),
  )
}

export function milestoneOf(track: UpgradeId, major: number): WorkshopMilestone | null {
  return WORKSHOP_MILESTONES.find((row) => row.track === track && row.major === major) ?? null
}

/** The next milestone above the major a track is on, for the plaque's star; null past the last. */
export function nextMilestoneOf(track: UpgradeId, majorOwned: number): WorkshopMilestone | null {
  return (
    WORKSHOP_MILESTONES.filter((row) => row.track === track && row.major > majorOwned).sort(
      (a, b) => a.major - b.major,
    )[0] ?? null
  )
}

/** The milestone a step bought from `fromStep` lands on, or null: a pip or an ordinary major. */
export function milestoneLandedBy(track: UpgradeId, fromStep: number): WorkshopMilestone | null {
  return isMajorStep(fromStep) ? milestoneOf(track, majorOf(fromStep) + 1) : null
}

/** Owned once the track has reached its major, and its feature (if any) has unlocked. */
export function isMilestoneOwned(
  row: WorkshopMilestone,
  majorReached: number,
  isFeatureUnlocked: FeatureUnlockedQuery,
): boolean {
  return majorReached >= row.major && isFeatureOpenFor(row, isFeatureUnlocked)
}

/** The milestones a vehicle at these majors owns, in the data's order. */
export function ownedMilestonesOf(
  majors: TrackNumbers,
  isFeatureUnlocked: FeatureUnlockedQuery,
): WorkshopMilestone[] {
  return WORKSHOP_MILESTONES.filter((row) =>
    isMilestoneOwned(row, majors[row.track], isFeatureUnlocked),
  )
}

function isFeatureOpenFor(
  row: WorkshopMilestone,
  isFeatureUnlocked: FeatureUnlockedQuery,
): boolean {
  return row.featureId === null || isFeatureUnlocked(row.featureId)
}

function loadWorkshopMilestones(raw: unknown): WorkshopMilestone[] {
  const problems = workshopMilestoneProblems(raw)
  if (problems.length > 0) {
    throw new Error(`milestones.json is refused:\n${problems.join('\n')}`)
  }
  return readRows(createFieldReader(), raw)
}

function readRows(reader: FieldReader, raw: unknown): WorkshopMilestone[] {
  const file = reader.object('milestones file', raw)
  return reader
    .list('milestones', file.milestones)
    .map((row, index) => readRow(reader, `milestones[${index}]`, row))
}

function readRow(reader: FieldReader, path: string, raw: unknown): WorkshopMilestone {
  const fields = reader.object(path, raw)
  const row: WorkshopMilestone = {
    track: readLiteral(reader, `${path}.track`, fields.track, UPGRADE_IDS),
    major: readMajor(reader, `${path}.major`, fields.major),
    behaviour: readLiteral(reader, `${path}.behaviour`, fields.behaviour, MILESTONE_BEHAVIOUR_IDS),
    partIds: readPartIds(reader, `${path}.partIds`, fields.partIds),
    featureId: readFeatureId(reader, `${path}.featureId`, fields.featureId),
  }
  checkSwapChangesSilhouette(reader, path, row)
  return row
}

function readMajor(reader: FieldReader, path: string, value: unknown): number {
  const major = reader.safeInteger(path, value)
  if (major < 1) reader.record(`${path} must be a major level of 1 or more, got ${major}`)
  return major
}

function readPartIds(reader: FieldReader, path: string, value: unknown): string[] {
  const partIds = reader.list(path, value).map((id, index) => reader.text(`${path}[${index}]`, id))
  if (partIds.length === 0) reader.record(`${path} must name at least one part`)
  partIds
    .filter((partId) => !isVehiclePartId(partId))
    .forEach((partId) => reader.record(`${path} names ${partId}, which is no vehicle part id`))
  return partIds
}

/** Absent means the milestone is the track's own part; present, it must be a locked-schedule row. */
function readFeatureId(reader: FieldReader, path: string, value: unknown): string | null {
  if (value === undefined) return null
  const featureId = reader.text(path, value)
  if (!isScheduleRowId(featureId)) {
    reader.record(`${path} names ${featureId}, which is no row of the locked schedule`)
  }
  return featureId
}

function isScheduleRowId(id: string): boolean {
  return LOCKED_SCHEDULE.rows.some((row) => row.id === id)
}

function checkSwapChangesSilhouette(
  reader: FieldReader,
  path: string,
  row: WorkshopMilestone,
): void {
  if (row.behaviour !== 'swap.part') return
  row.partIds
    .filter((partId) => tierOfPartId(partId) === BASE_TIER)
    .forEach((partId) =>
      reader.record(`${path} swaps in ${partId}, a tier-1 part: no new silhouette`),
    )
}

function checkOneRowPerMajor(reader: FieldReader, rows: readonly WorkshopMilestone[]): void {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = labelOf(row)
    if (seen.has(key)) reader.record(`${key} is listed twice`)
    seen.add(key)
  }
}

function labelOf(row: WorkshopMilestone): string {
  return `${row.track} major ${row.major}`
}
