/**
 * The `dock-building` registry kind of `scheduleRows.ts` (#221, the TD lock on #197): a building a
 * slice stamps onto the dock pad as a real facility, so its `facility` schedule row opens through
 * `builtFacilityRowIdsOn` and travel logs its `FeatureUnlocked`. The platform only travels forward,
 * so a building stands on every planet from its row's `planetIndex` on, the same rule as the
 * Refinery bay (#105). With nothing registered the dock is what it was.
 */
import type { UnlockRow } from '../unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import type { ScheduleRowClaim } from './content'
import { defineRegistry, entriesOf } from './seal'

export interface DockFacility {
  id: string
  /** The `facility` row of the locked schedule this building ships, and so claims. */
  scheduleRowId: string
}

export const DOCK_FACILITY_REGISTRY = defineRegistry<DockFacility>('dockFacilities')

/** The rows of the registered buildings standing on `planetIndex`, in facility id order. */
export function dockFacilityRowIdsOn(planetIndex: number): readonly string[] {
  return entriesOf(DOCK_FACILITY_REGISTRY)
    .filter((facility) => isStampedOn(facility, planetIndex))
    .map((facility) => facility.scheduleRowId)
}

/** Every schedule row a registered building claims, for the schedule coverage spec. */
export function dockFacilityScheduleRowClaims(): readonly ScheduleRowClaim[] {
  return entriesOf(DOCK_FACILITY_REGISTRY).map(({ id, scheduleRowId }) => ({
    rowId: scheduleRowId,
    entryId: id,
  }))
}

/** A building whose row is not a `facility` row of the locked schedule. */
export function dockFacilityProblems(): string[] {
  return entriesOf(DOCK_FACILITY_REGISTRY).flatMap((facility) =>
    isFacilityRow(rowOf(facility)) ? [] : [facilityRowProblem(facility)],
  )
}

function isStampedOn(facility: DockFacility, planetIndex: number): boolean {
  const row = rowOf(facility)
  return isFacilityRow(row) && planetIndex >= row.planetIndex
}

function rowOf(facility: DockFacility): UnlockRow | undefined {
  return LOCKED_SCHEDULE.rows.find((row) => row.id === facility.scheduleRowId)
}

function isFacilityRow(row: UnlockRow | undefined): row is UnlockRow {
  return row?.bind === 'facility'
}

function facilityRowProblem({ id, scheduleRowId }: DockFacility): string {
  return `dock facility "${id}" claims "${scheduleRowId}", which is no facility row of the schedule`
}
