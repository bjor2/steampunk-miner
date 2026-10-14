import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { readMigratedSaveSlot } from '../../../systems/save/saveMigrations'
import { saveSlotOf, type SaveSlotFile } from '../../../systems/save/saveSlot'
import {
  isShotCell,
  newShotCellsOf,
  SHOT_CELLS_SECTION,
  shotCellsOf,
  withNoShotCells,
  withShotCellsAdded,
  withShotCellsCut,
} from './shotCells'

// The `ground-gun.shot-cells` section (ticket 369): saved, restored and digested with the session;
// a save written before it restores with no shot cell, reported as a restored section (#224).

const fresh = () => createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })
const HELD = [
  { tx: -29, ty: 280 },
  { tx: -28, ty: 280 },
]

function saveOf(state: ReturnType<typeof fresh>): SaveSlotFile {
  return saveSlotOf(takeSnapshot(state), 1)
}

/** The save as a build before ticket 369 wrote it: no shot-cells section in its world. */
function withoutShotCellsSection(file: SaveSlotFile): SaveSlotFile {
  const { [SHOT_CELLS_SECTION.id]: _dropped, ...slices } = file.world.slices ?? {}
  return { ...file, world: { ...file.world, slices } }
}

function restored(file: unknown) {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading
}

describe('ground-gun: the shot-cells section', () => {
  it('holds no cell at first and leaves the state and digest untouched while empty', () => {
    const state = fresh()
    expect(shotCellsOf(state)).toEqual({})
    expect(stateDigest(withNoShotCells(state))).toBe(stateDigest(state))
    expect(withShotCellsCut(withShotCellsAdded(state, HELD), HELD)).toEqual(state)
  })

  it('round-trips its cells through the save, and the digest sees them', () => {
    const held = withShotCellsAdded(fresh(), HELD)
    const reading = restored(saveOf(held))
    expect(reading.migrations).toEqual([])
    expect(shotCellsOf(reading.state)).toEqual(shotCellsOf(held))
    expect(isShotCell(reading.state, -29, 280)).toBe(true)
    expect(isShotCell(reading.state, -30, 280)).toBe(false)
    expect(stateDigest(held)).not.toBe(stateDigest(fresh()))
  })

  it('restores a save written before the section with no shot cell, reported as restored', () => {
    const reading = restored(withoutShotCellsSection(saveOf(fresh())))
    expect(shotCellsOf(reading.state)).toEqual({})
    expect(reading.migrations).toEqual([{ restoredSections: [{ section: SHOT_CELLS_SECTION.id }] }])
  })

  it('names only the cells not held yet, each once', () => {
    const held = withShotCellsAdded(fresh(), HELD.slice(0, 1))
    const next = { tx: -27, ty: 280 }
    expect(newShotCellsOf(held, [...HELD, next, HELD[1]])).toEqual([HELD[1], next])
  })

  it('refuses a saved body that is no map of whole cells under their own keys', () => {
    expect(SHOT_CELLS_SECTION.problems({ '-29,280': { tx: -29, ty: 280 } })).toEqual([])
    expect(SHOT_CELLS_SECTION.problems([])).toEqual(['ground-gun.shot-cells must be an object'])
    expect(
      SHOT_CELLS_SECTION.problems({
        '1,2': { tx: 1, ty: 3 },
        '4,5': { tx: 4.5, ty: 5 },
        '6,7': 'cell',
      }),
    ).toEqual([
      'ground-gun.shot-cells.1,2 holds the cell 1,3',
      'ground-gun.shot-cells.4,5 must hold a safe integer tx and ty',
      'ground-gun.shot-cells.6,7 must be an object',
    ])
  })
})
