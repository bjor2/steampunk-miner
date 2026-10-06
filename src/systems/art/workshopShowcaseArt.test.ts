import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { ATTACH_IDS } from '../registries/vehicleAttach'
import { exportedSidecarOf, placeholderSidecarOf } from './artCatalogue'
import {
  blenderAssetIds,
  isValidPartId,
  reactionMajorPartIdOf,
  reactionStepPartIdOf,
  showcaseArmPartIdsOf,
  showcaseRigPartIds,
  UPGRADE_REACTION_ATTACH_IDS,
  UPGRADE_REACTIONS_ASSET_ID,
  upgradeReactionPartIds,
  upgradeReactionRowIds,
  WORKSHOP_SHOWCASE_ASSET_ID,
} from './artIds'
import { assetQuadsOf } from './assetLook'
import { pxPerMetreOf } from './artIds'
import type { PartsSidecar, SidecarPart } from './partsSidecar'
import { SHOWCASE_ATTACH_IDS, SHOWCASE_LIFT_PART_ID } from './workshopShowcaseArt'

// The Workshop showcase of #180 (art #182): the rig over the turntable and the reaction pieces it
// brings to the car, a small-step tool and a big-level-up component per upgrade row.
describe('workshop showcase art', () => {
  it('names the rig and the reaction pieces from the Workshop building’s attach zone', () => {
    expect(WORKSHOP_SHOWCASE_ASSET_ID).toBe('platform-workshop-showcase')
    expect(UPGRADE_REACTIONS_ASSET_ID).toBe('prop-workshop-reactions')
    expect(blenderAssetIds()).toEqual(
      expect.arrayContaining([WORKSHOP_SHOWCASE_ASSET_ID, UPGRADE_REACTIONS_ASSET_ID]),
    )
  })

  it('gives every row of the reaction table a small-step tool and a big-level-up component', () => {
    expect(upgradeReactionRowIds()).toEqual([
      'drill_power',
      'drill_tip',
      'engine',
      'boiler',
      'cargo_hold',
      'hull',
      'gun',
      'blasting_charges',
      'casing',
    ])
    for (const row of upgradeReactionRowIds()) {
      const pair = [reactionStepPartIdOf(row), reactionMajorPartIdOf(row)]
      expect(pair.every((part) => isValidPartId(UPGRADE_REACTIONS_ASSET_ID, part))).toBe(true)
    }
    expect(reactionStepPartIdOf('drill_power')).toBe('drill-power-step')
    expect(isValidPartId(UPGRADE_REACTIONS_ASSET_ID, 'drill-power-milestone')).toBe(false)
  })

  it('keys every reaction to a vehicle attach point, the drill power’s on the housing (#180 GD)', () => {
    const known: readonly string[] = [...ATTACH_IDS, ...SHOWCASE_ATTACH_IDS]
    for (const row of upgradeReactionRowIds()) {
      const attach = UPGRADE_REACTION_ATTACH_IDS[row]
      expect({ row, attach, known: known.includes(attach) }).toEqual({ row, attach, known: true })
    }
    expect(UPGRADE_REACTION_ATTACH_IDS.drill_power).toBe('drill.housing')
    expect(UPGRADE_REACTION_ATTACH_IDS.drill_tip).toBe('drill.head')
  })

  it('builds the rig from a hoist on a rail, two arms of two segments and a lift', () => {
    expect(showcaseRigPartIds()).toHaveLength(9)
    expect(showcaseArmPartIdsOf('left')).toEqual([
      'showcase-arm-upper-left',
      'showcase-arm-fore-left',
    ])
    expect(
      showcaseRigPartIds().every((part) => isValidPartId(WORKSHOP_SHOWCASE_ASSET_ID, part)),
    ).toBe(true)
    expect(isValidPartId(WORKSHOP_SHOWCASE_ASSET_ID, 'showcase-crane')).toBe(false)
  })

  it('bakes the rig at the platform density and the pieces at the vehicle’s, since they sit on the car', () => {
    expect(shippedSidecarOf(WORKSHOP_SHOWCASE_ASSET_ID).pxPerMetre).toBe(pxPerMetreOf('platform'))
    expect(shippedSidecarOf(UPGRADE_REACTIONS_ASSET_ID).pxPerMetre).toBe(pxPerMetreOf('vehicle'))
    for (const part of shippedSidecarOf(UPGRADE_REACTIONS_ASSET_ID).parts) {
      expect({ part: part.id, fitsTheCar: part.sizeM.every((side) => side <= 1) }).toEqual({
        part: part.id,
        fitsTheCar: true,
      })
    }
  })

  it('grips or hoists every piece from its top and lands its bottom, the mount axis, on the car', () => {
    for (const part of shippedSidecarOf(UPGRADE_REACTIONS_ASSET_ID).parts) {
      expect({ part: part.id, pivot: pivotEdgeOf(part) }).toEqual({
        part: part.id,
        pivot: 'bottom',
      })
    }
  })

  it('hangs the arm segments from their top bearings and the hook from the hoist, lowest first', () => {
    const rig = shippedSidecarOf(WORKSHOP_SHOWCASE_ASSET_ID)
    for (const part of rig.parts.filter((candidate) => candidate.id.startsWith('showcase-arm-'))) {
      expect({ part: part.id, pivot: pivotEdgeOf(part, BEARING_RADIUS_M) }).toEqual({
        part: part.id,
        pivot: 'top',
      })
    }
    expect(pivotEdgeOf(partOf(rig, 'showcase-chain'))).toBe('top')
    expect(pivotEdgeOf(partOf(rig, 'showcase-hook'))).toBe('bottom')
    expect(pivotEdgeOf(partOf(rig, SHOWCASE_LIFT_PART_ID))).toBe('bottom')
    expect(partOf(rig, 'showcase-rail').atM[1]).toBeGreaterThan(partOf(rig, 'showcase-hook').atM[1])
    expect(partOf(rig, 'showcase-lift').atM[1]).toBeLessThan(1)
  })

  it('draws the rig and every piece from their atlases once exported', () => {
    for (const assetId of [WORKSHOP_SHOWCASE_ASSET_ID, UPGRADE_REACTIONS_ASSET_ID]) {
      const quads = assetQuadsOf(SHIPPED_ART, assetId, 1)
      expect(quads.map((quad) => quad.partId).sort()).toEqual(
        [
          ...(assetId === WORKSHOP_SHOWCASE_ASSET_ID
            ? showcaseRigPartIds()
            : upgradeReactionPartIds()),
        ].sort(),
      )
      if (exportedSidecarOf(SHIPPED_ART, assetId) !== null) {
        expect(quads.every((quad) => quad.uv !== null)).toBe(true)
      }
    }
  })
})

/** An arm segment turns about the centre of its top bearing, which is this big at most. */
const BEARING_RADIUS_M = 0.2

/**
 * Which edge of the part its pivot sits on, within `tolerance` metres: a piece's mount axis need
 * not be its bounds' centre (a turret's barrel reaches out to one side), so only the height counts.
 */
function pivotEdgeOf(part: SidecarPart, tolerance = 0.015): 'top' | 'bottom' | 'elsewhere' {
  const height = part.sizeM[1]
  const y = part.pivotM[1]
  if (y < tolerance) return 'bottom'
  return height - y < tolerance ? 'top' : 'elsewhere'
}

function shippedSidecarOf(assetId: string): PartsSidecar {
  const sidecar =
    exportedSidecarOf(SHIPPED_ART, assetId) ?? placeholderSidecarOf(SHIPPED_ART, assetId)
  if (sidecar === null) throw new Error(`${assetId} has no sidecar`)
  return sidecar
}

function partOf(sidecar: PartsSidecar, partId: string): SidecarPart {
  const part = sidecar.parts.find((candidate) => candidate.id === partId)
  if (part === undefined) throw new Error(`${sidecar.assetId} has no part ${partId}`)
  return part
}
