import { describe, expect, it } from 'vitest'
import { SAMPLES_PER_TILE, SOLID_DENSITY } from '../world/sampleGrid'
import { GROUND_CELL, LAVA_CELL } from '../world/worldCell'
import type { DrillableGround } from './drillContact'
import { sweptDrillStampOf } from './drillStamp'
import { leadingSlabOf } from './leadingSlab'
import { FACING, facingVectorOf, type VehiclePose } from './vehiclePose'

// The rig faces right, its centre in the middle of tile (0, 0), cutting level on the ground.
const POSE: VehiclePose = { x: 500, y: 500, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.right }
const AIM = {
  centreMm: { x: POSE.x, y: POSE.y },
  facing: facingVectorOf(POSE.upx, POSE.upy, POSE.facing),
  stamp: sweptDrillStampOf(POSE, false),
}

/** Ground that is solid where `isSolid(tx, ty)` says, open elsewhere. */
function groundOf(isSolid: (tx: number, ty: number) => boolean): DrillableGround {
  const tileOf = (sample: number) => Math.floor(sample / SAMPLES_PER_TILE)
  return {
    densityAt: (sx, sy) => (isSolid(tileOf(sx), tileOf(sy)) ? SOLID_DENSITY : 0),
    materialAt: () => GROUND_CELL,
  }
}

describe('leading slab (ticket 333)', () => {
  it('is all uncut in fresh rock ahead of the face', () => {
    const slab = leadingSlabOf(
      groundOf(() => true),
      AIM,
    )
    expect(slab.uncutBp).toBe(10000)
    expect(slab.uncutTiles.length).toBeGreaterThan(0)
  })

  it('is all cut in a carved tunnel', () => {
    const slab = leadingSlabOf(
      groundOf((_, ty) => ty !== 0),
      AIM,
    )
    expect(slab).toEqual({ uncutBp: 0, uncutTiles: [] })
  })

  it('stays under the gate line when one fresh cell grazes a carved bore', () => {
    const grazing = groundOf((tx, ty) => ty !== 0 || tx === 1)
    const beside = groundOf((tx, ty) => ty === 1 && tx === 1)
    expect(leadingSlabOf(grazing, AIM).uncutBp).toBeGreaterThan(0)
    expect(leadingSlabOf(beside, AIM).uncutBp).toBeLessThan(2500)
  })

  it('names each uncut cell once', () => {
    const { uncutTiles } = leadingSlabOf(
      groundOf(() => true),
      AIM,
    )
    const keys = uncutTiles.map(({ tx, ty }) => `${tx},${ty}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every((key) => !key.startsWith('-'))).toBe(true)
  })

  it('never counts a wall or lava as ground to cut', () => {
    const walls: DrillableGround = {
      densityAt: () => SOLID_DENSITY,
      materialAt: () => LAVA_CELL,
    }
    expect(leadingSlabOf(walls, AIM).uncutBp).toBe(0)
  })
})
