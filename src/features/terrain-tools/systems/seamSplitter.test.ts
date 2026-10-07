import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { PARAMS } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chargesLeftOf } from '../../power-up-core'
import {
  buriedTile,
  materialsAround,
  ofType,
  press,
  sessionWith,
  standAt,
} from '../terrainTestSession'
import { SEAM_SPLITTER_ID } from './seamSplitter'

// The seam splitter (#162 row, 4.3): a wedge at the face the miner faces opens a fissure of plain
// ground, at most 8 cells along the seeded grain. A line, never an area: it opens ground only,
// moves no material and collects nothing.

const SPLITTER = { 'powerup.1': SEAM_SPLITTER_ID }

function splitAt(depth: number) {
  const session = sessionWith(SPLITTER)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, FACING.right)
  const materials = materialsAround(session.state(), stand, 12)
  const densities = densitiesAround(session.state(), stand, 12)
  const cargo = session.vehicle().cargo
  session.submit(10, press())
  session.advanceTo(20)
  const opened = emptiedTiles(densities, densitiesAround(session.state(), stand, 12))
  return { session, stand, materials, cargo, opened }
}

function editOf(session: ReturnType<typeof splitAt>['session']) {
  const [edited] = ofType(session.events(), 'terrain-tools.TerrainEdited')
  if (edited?.type !== 'terrain-tools.TerrainEdited') throw new Error('no edit')
  return edited
}

describe('seam splitter', () => {
  it('opens a fissure of at most 8 plain ground cells and uses one unit of the stack', () => {
    const { session } = splitAt(8)
    const edited = editOf(session)
    expect(edited.cellsChanged).toBeGreaterThan(0)
    expect(edited.cellsChanged).toBeLessThanOrEqual(8)
    expect(chargesLeftOf(session.state(), 'p1', SEAM_SPLITTER_ID)).toBe(2)
  })

  it('opens one straight line of tiles beyond the anchors', () => {
    const { session, stand, opened } = splitAt(8)
    expect(opened.length).toBe(editOf(session).cellsChanged)
    expect(opened.every(({ tx }) => tx > stand.tx + 1)).toBe(true)
    const steps = opened
      .slice(1)
      .map((tile, at) => [tile.tx - opened[at].tx, tile.ty - opened[at].ty])
    expect(new Set(steps.map(String)).size).toBeLessThanOrEqual(1)
  })

  it('moves no material and puts nothing in the hold', () => {
    const { session, stand, materials, cargo } = splitAt(8)
    expect(materialsAround(session.state(), stand, 12)).toEqual(materials)
    expect(session.vehicle().cargo).toEqual(cargo)
  })

  it('is blocked by a core cell at the face, which stays, and keeps the unit', () => {
    const session = sessionWith(SPLITTER)
    standAt(session, 5, { tx: -2, ty: 0 }, FACING.right)
    session.submit(10, press())
    session.advanceTo(20)
    expect(ofType(session.events(), 'power-up-core.PowerUpBlocked')).toMatchObject([
      { itemId: SEAM_SPLITTER_ID, gateKind: 'core', tx: 0, ty: 0 },
    ])
    expect(ofType(session.events(), 'terrain-tools.TerrainEdited')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', SEAM_SPLITTER_ID)).toBe(3)
  })
})

/** The density of every tile in a square round `centre`, by tile. */
function densitiesAround(state: AuthorityState, centre: TilePoint, reach: number) {
  const densities = new Map<string, number>()
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const tile = { tx: centre.tx + dx, ty: centre.ty + dy }
      densities.set(`${tile.tx},${tile.ty}`, cellDensitySum(state.world, PARAMS, tile))
    }
  }
  return densities
}

/** Tiles the press emptied, in walking order from the miner. */
function emptiedTiles(before: Map<string, number>, after: Map<string, number>): TilePoint[] {
  return [...before]
    .filter(([key, density]) => density > 0 && after.get(key) === 0)
    .map(([key]) => {
      const [tx, ty] = key.split(',').map((part) => parseInt(part, 10))
      return { tx, ty }
    })
    .sort((a, b) => a.tx - b.tx || a.ty - b.ty)
}
