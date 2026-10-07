import { describe, expect, it } from 'vitest'
import { FACING, type Facing, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { backfillRowOf, isTileClearOfHull } from './backfillRow'

/** Upright at the planet's top, centred on tile (30, 285). */
function poseFacing(facing: Facing): VehiclePose {
  return { x: 30500, y: 285500, vx: 0, vy: 0, upx: 0, upy: 1024, facing }
}

const FILL_BEHIND_M = 2
const CLEARANCE_MM = 1000

describe('spoil auger backfill row', () => {
  it('lies across the shaft above a miner drilling down', () => {
    expect(backfillRowOf(poseFacing(FACING.down), FILL_BEHIND_M)).toEqual([
      { tx: 30, ty: 288 },
      { tx: 31, ty: 288 },
      { tx: 29, ty: 288 },
    ])
  })

  it('lies across the tunnel behind a miner drilling right', () => {
    expect(backfillRowOf(poseFacing(FACING.right), FILL_BEHIND_M)).toEqual([
      { tx: 27, ty: 285 },
      { tx: 27, ty: 286 },
      { tx: 27, ty: 284 },
    ])
  })

  it('keeps every tile of the row the fill distance clear of the hull', () => {
    for (const facing of [FACING.left, FACING.right, FACING.down, FACING.up]) {
      const pose = poseFacing(facing)
      for (const tile of backfillRowOf(pose, FILL_BEHIND_M)) {
        expect(isTileClearOfHull(pose, tile, FILL_BEHIND_M * 1000)).toBe(true)
      }
    }
  })

  it('counts a tile clear only from a metre beyond the hull', () => {
    const pose = poseFacing(FACING.right)
    expect(isTileClearOfHull(pose, { tx: 30, ty: 285 }, CLEARANCE_MM)).toBe(false)
    expect(isTileClearOfHull(pose, { tx: 31, ty: 285 }, CLEARANCE_MM)).toBe(false)
    expect(isTileClearOfHull(pose, { tx: 32, ty: 285 }, CLEARANCE_MM)).toBe(true)
  })
})
