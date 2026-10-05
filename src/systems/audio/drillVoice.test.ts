import { describe, expect, it } from 'vitest'
import {
  createScriptedSession,
  mineTile,
  poseAbove,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { drillVoiceOf } from './drillVoice'

/** A pose centred in `tile` itself, not on top of it. */
function poseInside(tile: TilePoint, facing: Facing) {
  const { type, payload } = poseAbove(tile, facing)
  return { type, payload: { ...payload, y: tile.ty * 1000 + 500 } }
}

/** A mined hole whose right-hand wall cell is lined, with the vehicle in the hole facing it. */
function facingLinedWall() {
  const session = createScriptedSession()
  const [ore] = surfaceOreTiles(1)
  const hole = { tx: ore.tx - 1, ty: ore.ty }
  mineTile(session, 10, hole)
  session.submit(60, {
    type: 'debug.lineCasing',
    payload: { x: ore.tx * 1000 - 950, y: ore.ty * 1000 + 375, grade: 2 },
  })
  session.submit(61, poseInside(hole, FACING.right))
  return session
}

describe('drill voice', () => {
  it('sings in the rock voice with plain rock at the nose', () => {
    const session = createScriptedSession()
    session.submit(1, poseAbove(surfaceOreTiles(1)[0], FACING.down))
    expect(drillVoiceOf(session.state(), 'p1')).toBe('rock')
  })

  it('sings in the casing voice while the cell at the nose holds lining', () => {
    expect(drillVoiceOf(facingLinedWall().state(), 'p1')).toBe('casing')
  })
})
