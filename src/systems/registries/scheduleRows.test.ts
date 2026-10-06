import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { contentScheduleRowClaims } from './content'
import {
  DEFERRED_SCHEDULE_ROWS,
  GENERATED_SCHEDULE_ROWS,
  scheduleRowHomeProblems,
  type ScheduleRowHomes,
} from './scheduleRows'

const NO_HOMES: ScheduleRowHomes = { claims: [], generated: [], deferred: {} }

describe('schedule row coverage', () => {
  it('gives every row of the locked schedule exactly one home among the loaded slices', () => {
    const rowIds = LOCKED_SCHEDULE.rows.map(({ id }) => id)
    const homes: ScheduleRowHomes = {
      claims: contentScheduleRowClaims(),
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
