import { describe, expect, it } from 'vitest'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chargesLeftOf } from '../../power-up-core'
import { buriedTile, ofType, oreAround, press, sessionWith, standAt } from '../terrainTestSession'
import { ORE_SHIFTER_ID } from './oreShifter'

// The magnetic ore-shifter (#162 row, 4.2): a press drags a few loose ore cells within 6 tiles
// toward the hull along seeded paths, nearest first, as one whole edit queued on the activation
// tick; it collects nothing and makes or loses no ore.

const SHIFTER = { 'powerup.1': ORE_SHIFTER_ID }
const REACH = 6
/** The 6-tick wind-up, then the queue's two ticks for a corner edit. */
const SETTLED = 20

function distanceSq(a: TilePoint, b: TilePoint): number {
  return (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2
}

function shiftAt(depth: number) {
  const session = sessionWith(SHIFTER)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, FACING.right)
  const before = oreAround(session.state(), stand, REACH + 1)
  session.submit(10, press())
  session.advanceTo(10 + SETTLED)
  return { session, stand, before, after: oreAround(session.state(), stand, REACH + 1) }
}

describe('ore-shifter', () => {
  it('queues one terrain edit of swaps and spends a charge', () => {
    const { session } = shiftAt(8)
    const [edited] = ofType(session.events(), 'terrain-tools.TerrainEdited')
    expect(edited).toMatchObject({ playerId: 'p1', itemId: ORE_SHIFTER_ID, mark: 1 })
    if (edited?.type !== 'terrain-tools.TerrainEdited') throw new Error('no edit')
    expect(edited.cellsChanged).toBeGreaterThan(0)
    expect(edited.cellsChanged % 2).toBe(0)
    expect(chargesLeftOf(session.state(), 'p1', ORE_SHIFTER_ID)).toBe(1)
  })

  it('draws ore closer to the miner and keeps every nodule', () => {
    const { stand, before, after } = shiftAt(8)
    const pull = (ore: typeof before) =>
      ore.reduce((sum, { tile }) => sum + distanceSq(tile, stand), 0)
    expect(after.map(({ cell }) => cell).sort()).toEqual(before.map(({ cell }) => cell).sort())
    expect(pull(after)).toBeLessThan(pull(before))
  })

  it('drags at most the 8 cells of Mark 1', () => {
    const { session } = shiftAt(8)
    const [edited] = ofType(session.events(), 'terrain-tools.TerrainEdited')
    if (edited?.type !== 'terrain-tools.TerrainEdited') throw new Error('no edit')
    expect(edited.cellsChanged).toBeLessThanOrEqual(2 * 8)
  })
})
