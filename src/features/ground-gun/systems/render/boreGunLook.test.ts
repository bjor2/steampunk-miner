import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { exportedSidecarOf } from '../../../../systems/art/artCatalogue'
import { blenderAssetIds, kernelBlenderAssetIds } from '../../../../systems/art/artIds'
import { ARC_EDGE_BEARINGS, BORE_BEARING_COUNT } from '../../../../systems/authority/bore/boreAim'
import { slice } from '../../register'
import {
  barrelTurnOf,
  BORE_BARREL_PART_ID,
  BORE_GUN_ASSET_ID,
  BORE_MOUNT_PART_ID,
  boreGunArtAssets,
  boreGunMountOf,
  boreGunQuadsOf,
  stepBarrelTurn,
} from './boreGunLook'

const RIGHT_HORIZONTAL = BORE_BEARING_COUNT - 1
const LEFT_HORIZONTAL = 0
/** #362: the barrel pivots on its trunnion this far below the saddle's origin. */
const TRUNNION_BELOW_M = 0.108

function mountedQuads() {
  const mount = withRegistrations([slice], boreGunMountOf)
  if (mount === null) throw new Error('the bore gun has no mount')
  return boreGunQuadsOf(SHIPPED_ART, mount)
}

describe('bore gun on the rig (ticket 315)', () => {
  it('hangs at hull.front through its registered attach use, and nowhere without the slice', () => {
    expect(withRegistrations([slice], boreGunMountOf)).toEqual({
      assetId: BORE_GUN_ASSET_ID,
      attachId: 'hull.front',
    })
    expect(withRegistrations([], boreGunMountOf)).toBeNull()
  })

  it('ships the exported mount with the registered parts and no others', () => {
    const exported = (exportedSidecarOf(SHIPPED_ART, BORE_GUN_ASSET_ID)?.parts ?? []).map(
      (part) => part.id,
    )
    expect(exported.sort()).toEqual([BORE_BARREL_PART_ID, BORE_MOUNT_PART_ID])
    expect(boreGunArtAssets()[0].parts).toEqual([BORE_MOUNT_PART_ID, BORE_BARREL_PART_ID])
  })

  it('names its asset only while the slice is loaded, so the kernel list is unchanged without it', () => {
    expect(withRegistrations([slice], blenderAssetIds)).toContain(BORE_GUN_ASSET_ID)
    expect(withRegistrations([], blenderAssetIds)).toEqual([...kernelBlenderAssetIds()].sort())
  })

  it("puts the saddle's origin on the vehicle's hull.front point and turns the barrel on its trunnion", () => {
    const { fixed, barrel, trunnion } = mountedQuads()
    expect(fixed.map((quad) => quad.partId)).toEqual([BORE_MOUNT_PART_ID])
    expect(fixed[0].pivot).toEqual([0.48, -0.08])
    expect(trunnion[0]).toBeCloseTo(0.48, 3)
    expect(trunnion[1]).toBeCloseTo(-0.08 - TRUNNION_BELOW_M, 3)
    expect(barrel.map((quad) => quad.partId)).toEqual([BORE_BARREL_PART_ID])
    expect(barrel[0].pivot).toEqual([0, 0])
  })

  it('rests along +X for the right horizontal and turns down through the arc to the left', () => {
    expect(barrelTurnOf(RIGHT_HORIZONTAL)).toBeCloseTo(0, 2)
    expect(barrelTurnOf(ARC_EDGE_BEARINGS.right)).toBeCloseTo(-Math.PI / 3, 1)
    expect(barrelTurnOf(ARC_EDGE_BEARINGS.left)).toBeCloseTo((-2 * Math.PI) / 3, 1)
    expect(barrelTurnOf(LEFT_HORIZONTAL)).toBeCloseTo(-Math.PI, 2)
  })

  it('never jumps across the arc: each bearing turns the barrel further down and round', () => {
    const turns = Array.from({ length: BORE_BEARING_COUNT }, (_, bearing) => barrelTurnOf(bearing))
    expect(turns.every((turn, at) => at === 0 || turn >= turns[at - 1])).toBe(true)
  })

  it('swings to its aim at the turret rate, the same in one step or many', () => {
    const target = barrelTurnOf(ARC_EDGE_BEARINGS.right)
    expect(stepBarrelTurn(0, target, 1)).toBe(target)
    let stepped = 0
    for (let frame = 0; frame < 144; frame++) stepped = stepBarrelTurn(stepped, target, 1 / 144)
    expect(stepped).toBe(target)
    expect(stepBarrelTurn(0, target, 1 / 144)).toBeGreaterThan(target)
  })
})
