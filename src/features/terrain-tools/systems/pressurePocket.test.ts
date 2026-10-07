import { describe, expect, it } from 'vitest'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { chargesLeftOf } from '../../power-up-core'
import { buriedTile, ofType, oreAround, press, sessionWith, standAt } from '../terrainTestSession'
import { PRESSURE_POCKET_ID } from './pressurePocket'

// The pressure pocket lance (#162 row, 4.2): it blows a pocket of radius 2 ahead of the miner,
// past the 1 m anchors. Plain ground opens; an ore cell is pushed out past the rim and kept. At
// most 32 density cells' worth of the queue's units per activation (TD cap, #162 section 3).

const LANCE = { 'powerup.1': PRESSURE_POCKET_ID }

/** Half the hull, the 1 m anchors and the radius: 3.45 m from the miner's centre, 3 tiles over. */
const POCKET_CENTRE_TILES = 3

function blowAt(depth: number, facing = FACING.right) {
  const session = sessionWith(LANCE)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, facing)
  const ore = oreAround(session.state(), stand, 10)
  session.submit(10, press())
  session.advanceTo(30)
  const [edited] = ofType(session.events(), 'terrain-tools.TerrainEdited')
  if (edited?.type !== 'terrain-tools.TerrainEdited') throw new Error('no edit')
  return { session, stand, ore, edited }
}

describe('pressure pocket lance', () => {
  it('opens a pocket ahead of the miner and spends a charge', () => {
    const { session, edited } = blowAt(9)
    expect(edited).toMatchObject({ itemId: PRESSURE_POCKET_ID, mark: 1 })
    expect(edited.cellsChanged).toBeGreaterThan(4)
    expect(chargesLeftOf(session.state(), 'p1', PRESSURE_POCKET_ID)).toBe(1)
  })

  it('never destroys ore: every nodule near the pocket is still in the ground', () => {
    for (const depth of [7, 9, 12, 15]) {
      const { session, stand, ore } = blowAt(depth)
      const after = oreAround(session.state(), stand, 10)
      expect(after.map(({ cell }) => cell).sort()).toEqual(ore.map(({ cell }) => cell).sort())
    }
  })

  it('pushes an ore cell in the pocket out past its rim', () => {
    const depth = DEPTHS.find((candidate) => oreInPocketAt(candidate).length > 0)
    if (depth === undefined) throw new Error('no ore in any pocket below column 20')
    const pushed = oreInPocketAt(depth)
    const { session, stand, ore } = blowAt(depth)
    expect(oreAround(session.state(), stand, 10).length).toBe(ore.length)
    const stillThere = pushed.filter((tile) => oreAround(session.state(), tile, 0).length > 0)
    expect(stillThere.length).toBeLessThan(pushed.length)
  })
})

const DEPTHS = Array.from({ length: 40 }, (_, at) => at + 6)

/** The ore tiles of the pocket a miner standing `depth` tiles down, facing right, would blow. */
function oreInPocketAt(depth: number) {
  const stand = buriedTile(depth)
  const centre = { tx: stand.tx + POCKET_CENTRE_TILES, ty: stand.ty }
  return oreAround(sessionWith(LANCE).state(), centre, 2).map(({ tile }) => tile)
}
