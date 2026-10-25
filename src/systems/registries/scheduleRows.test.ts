import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { contentScheduleRowClaims } from './content'
import { dockFacilityScheduleRowClaims } from './dockFacilities'
import {
  DEFERRED_SCHEDULE_ROWS,
  foldersNamedForRows,
  GENERATED_SCHEDULE_ROWS,
  scheduleRowHomeProblems,
  unshippedRowStatusProblems,
  type ScheduleRowHomes,
  type ShippingFolder,
} from './scheduleRows'

const NO_HOMES: ScheduleRowHomes = { claims: [], generated: [], deferred: {} }

describe('schedule row coverage', () => {
  it('gives every row of the locked schedule exactly one home among the loaded slices', () => {
    const rowIds = LOCKED_SCHEDULE.rows.map(({ id }) => id)
    const homes: ScheduleRowHomes = {
      claims: [...contentScheduleRowClaims(), ...dockFacilityScheduleRowClaims()],
      generated: GENERATED_SCHEDULE_ROWS,
      deferred: DEFERRED_SCHEDULE_ROWS,
    }
    expect(scheduleRowHomeProblems(rowIds, homes)).toEqual([])
  })

  it('finds a row with no home', () => {
    expect(scheduleRowHomeProblems(['wagons'], NO_HOMES)).toEqual([
      'schedule row "wagons" has no home',
    ])
  })

  it('finds a row a registered entry claims while it is still deferred', () => {
    const homes: ScheduleRowHomes = {
      ...NO_HOMES,
      claims: [{ rowId: 'wagons', entryId: 'mobility.wagon' }],
      deferred: { wagon: ['wagons'] },
    }
    expect(scheduleRowHomeProblems(['wagons'], homes)).toEqual([
      'schedule row "wagons" has 2 homes: entry "mobility.wagon", the deferred list (wagon)',
    ])
  })

  it('finds a home naming no row of the schedule', () => {
    const homes: ScheduleRowHomes = { ...NO_HOMES, generated: ['mark_11'] }
    expect(scheduleRowHomeProblems([], homes)).toEqual([
      'the generated list names "mark_11", which is no schedule row',
    ])
  })
})

/** The folders under src/features/ on this checkout. */
function featureFolders(): string[] {
  const features = new URL('../../features/', import.meta.url)
  return readdirSync(features, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

/** Every feature folder that ships a row: its slice registers an entry claiming it, or is named for it. */
function shippingFoldersOnMain(): ShippingFolder[] {
  const claims = [...contentScheduleRowClaims(), ...dockFacilityScheduleRowClaims()]
  const rowIds = LOCKED_SCHEDULE.rows.map(({ id }) => id)
  return [
    ...claims.map(({ rowId, sliceId }) => ({ rowId, folder: sliceId })),
    ...foldersNamedForRows(rowIds, featureFolders()),
  ]
}

describe('schedule row status', () => {
  it('marks shipped every row a feature folder on this branch ships (ticket 900)', () => {
    expect(unshippedRowStatusProblems(LOCKED_SCHEDULE.rows, shippingFoldersOnMain())).toEqual([])
  })

  it('names a planned row whose slice registers an entry claiming it', () => {
    const rows = [{ id: 'wagons', status: 'planned' }]
    expect(unshippedRowStatusProblems(rows, [{ rowId: 'wagons', folder: 'mobility' }])).toEqual([
      'schedule row "wagons" reads planned, but src/features/mobility ships it',
    ])
  })

  it('names a building row once, however many entries of one folder claim it', () => {
    const rows = [{ id: 'wagons', status: 'building' }]
    const shipping = [
      { rowId: 'wagons', folder: 'mobility' },
      { rowId: 'wagons', folder: 'mobility' },
    ]
    expect(unshippedRowStatusProblems(rows, shipping)).toEqual([
      'schedule row "wagons" reads building, but src/features/mobility ships it',
    ])
  })

  it('leaves shipped and vision rows alone, folder or not', () => {
    const rows = [
      { id: 'wagons', status: 'shipped' },
      { id: 'magma_tick', status: 'vision' },
    ]
    const shipping = [
      { rowId: 'wagons', folder: 'mobility' },
      { rowId: 'magma_tick', folder: 'magma-tick' },
    ]
    expect(unshippedRowStatusProblems(rows, shipping)).toEqual([])
  })

  it('finds the folder named for a row by its kebab-cased id', () => {
    expect(foldersNamedForRows(['casing_cement', 'wagons'], ['casing-cement', 'dynamite'])).toEqual(
      [{ rowId: 'casing_cement', folder: 'casing-cement' }],
    )
  })
})
