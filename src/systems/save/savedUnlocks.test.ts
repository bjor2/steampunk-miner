import { describe, expect, it } from 'vitest'
import { openFeatureIdsIn, type UnlockStanding } from '../authority/featureUnlocks'
import type { UnlockRow, UnlockSchedule } from '../unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { unlocksOnLoadIn, unlocksToSave } from './savedUnlocks'

const onPlanet = (index: number): UnlockStanding => ({
  planet: { index },
  players: { p1: { artefact: null } },
})

/** A row the next schedule refresh adds (#401 HS3: granted on load if its planet is reached). */
function addedRow(id: string, planetIndex: number, bind: UnlockRow['bind']): UnlockRow {
  return {
    id,
    name: id,
    planetIndex,
    lane: 'Feature',
    progressionAxis: 'horizontal',
    status: 'planned',
    bind,
    count: 1,
  }
}

const REFRESHED: UnlockSchedule = {
  ...LOCKED_SCHEDULE,
  rows: [
    ...LOCKED_SCHEDULE.rows,
    addedRow('added_gate_below', 3, 'planet_gate'),
    addedRow('added_gate_at', 10, 'planet_gate'),
    addedRow('added_gate_beyond', 11, 'planet_gate'),
    addedRow('added_artefact_below', 3, 'artefact'),
  ],
}

const savedOnPlanet10 = () => unlocksToSave(onPlanet(10))

describe('saved unlocks', () => {
  it('keeps the ids of the rows open when the save was written, not a count', () => {
    const saved = savedOnPlanet10()
    expect(saved).toEqual(openFeatureIdsIn(LOCKED_SCHEDULE, onPlanet(10)))
    expect(saved.length).toBeGreaterThan(0)
    expect(saved.every((id) => typeof id === 'string')).toBe(true)
  })

  it('shows exactly the saved ids when the schedule has not changed', () => {
    const saved = savedOnPlanet10()
    expect(unlocksOnLoadIn(LOCKED_SCHEDULE, saved, onPlanet(10))).toEqual(saved)
  })

  it('ignores an id this build does not know, and never shows it', () => {
    const saved = [...savedOnPlanet10(), 'retired_row']
    expect(unlocksOnLoadIn(LOCKED_SCHEDULE, saved, onPlanet(10))).not.toContain('retired_row')
  })

  it('ignores a held row the save names, and never shows it', () => {
    const held = LOCKED_SCHEDULE.rows.find(
      (row) => row.status === 'vision' && row.planetIndex <= 10,
    )
    expect(held).toBeDefined()
    const saved = [...savedOnPlanet10(), held!.id]
    expect(unlocksOnLoadIn(LOCKED_SCHEDULE, saved, onPlanet(10))).not.toContain(held!.id)
  })

  it('grants a planet_gate row added since the save when its planet is at or below the saved planet', () => {
    const shown = unlocksOnLoadIn(REFRESHED, savedOnPlanet10(), onPlanet(10))
    expect(shown).toContain('added_gate_below')
    expect(shown).toContain('added_gate_at')
    expect(shown).not.toContain('added_gate_beyond')
  })

  it('grants an artefact row added since the save only for the pick that opens it', () => {
    const shown = unlocksOnLoadIn(REFRESHED, savedOnPlanet10(), onPlanet(10))
    expect(shown).not.toContain('added_artefact_below')
    const picked: UnlockStanding = {
      planet: { index: 10 },
      players: { p1: { artefact: { id: 'artefact.x', fromPlanet: 3, breathingRoomCharges: 0 } } },
    }
    expect(unlocksOnLoadIn(REFRESHED, savedOnPlanet10(), picked)).toContain('added_artefact_below')
  })

  it('keeps a saved row a refresh moved past the saved planet', () => {
    const moved: UnlockSchedule = {
      ...LOCKED_SCHEDULE,
      rows: LOCKED_SCHEDULE.rows.map((row) =>
        row.id === savedOnPlanet10().at(-1) ? { ...row, planetIndex: 30 } : row,
      ),
    }
    expect(unlocksOnLoadIn(moved, savedOnPlanet10(), onPlanet(10))).toEqual(savedOnPlanet10())
  })
})
