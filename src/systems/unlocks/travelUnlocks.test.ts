import { describe, expect, it } from 'vitest'
import { CAMPAIGN_LAST_PLANET } from '../../constants/balance'
import type { UnlockRow, UnlockSchedule } from './readUnlockSchedule'
import { isUnlockedByTravel, rowsUnlockedByTravel } from './travelUnlocks'
import { LOCKED_SCHEDULE } from './unlockSchedule'

/** The locked table as if every vision row's module were built. */
const BUILT_SCHEDULE: UnlockSchedule = {
  ...LOCKED_SCHEDULE,
  rows: LOCKED_SCHEDULE.rows.map((row) =>
    row.status === 'vision' ? { ...row, status: 'planned' } : row,
  ),
}

const rowOf = (schedule: UnlockSchedule, id: string) =>
  schedule.rows.find((row) => row.id === id) as UnlockRow

const idsOf = (rows: readonly UnlockRow[]) => rows.map((row) => row.id)

const travelledPlanets = Array.from({ length: CAMPAIGN_LAST_PLANET + 1 }, (_, index) => index + 1)

describe('travel unlocks', () => {
  it('opens planet_2 on arriving at planet 2', () => {
    expect(idsOf(rowsUnlockedByTravel(LOCKED_SCHEDULE, 1, 2))).toEqual(['planet_2'])
  })

  it('opens every built planet_gate row exactly on arriving at its listed planet', () => {
    const gated = BUILT_SCHEDULE.rows.filter((row) => row.bind === 'planet_gate')
    for (const row of gated) {
      expect(isUnlockedByTravel(row, row.planetIndex - 1)).toBe(false)
      expect(isUnlockedByTravel(row, row.planetIndex)).toBe(true)
    }
  })

  it('opens on each hop the built planet_gate rows listed on the planet arrived at', () => {
    for (const toPlanet of travelledPlanets.slice(1)) {
      const listed = BUILT_SCHEDULE.rows.filter(
        (row) => row.bind === 'planet_gate' && row.planetIndex === toPlanet,
      )
      expect(rowsUnlockedByTravel(BUILT_SCHEDULE, toPlanet - 1, toPlanet)).toEqual(listed)
    }
  })

  it('opens nothing for a vision row whose module is not built (#90)', () => {
    expect(isUnlockedByTravel(rowOf(LOCKED_SCHEDULE, 'magma_tick'), CAMPAIGN_LAST_PLANET)).toBe(
      false,
    )
    expect(rowsUnlockedByTravel(LOCKED_SCHEDULE, 8, 9)).toEqual([])
  })

  it('never opens an artefact, facility or manual row by travel alone', () => {
    const shut = BUILT_SCHEDULE.rows.filter((row) => row.bind !== 'planet_gate')
    for (const row of shut) {
      expect(isUnlockedByTravel(row, Number.MAX_SAFE_INTEGER)).toBe(false)
    }
  })

  it('leaves endless_unlock shut on arriving at planet 40 and past it, even once built', () => {
    const endless = rowOf(BUILT_SCHEDULE, 'endless_unlock')
    expect(endless).toMatchObject({ planetIndex: CAMPAIGN_LAST_PLANET, bind: 'manual' })
    expect(isUnlockedByTravel(endless, CAMPAIGN_LAST_PLANET + 1)).toBe(false)
    expect(idsOf(rowsUnlockedByTravel(BUILT_SCHEDULE, 39, 40))).toEqual(['finale'])
  })

  it('opens nothing on a hop that reaches no new planet', () => {
    expect(rowsUnlockedByTravel(BUILT_SCHEDULE, 8, 8)).toEqual([])
    expect(rowsUnlockedByTravel(BUILT_SCHEDULE, 8, 3)).toEqual([])
  })
})
