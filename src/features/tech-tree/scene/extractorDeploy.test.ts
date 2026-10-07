import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { GEAR_ART, vehicleWithPoints } from '../systems/render/gearArtFixture'
import { FOLDED, pivotedQuadOf } from '../systems/render/rigGear'
import { mountedGearQuadsOf, type GearQuad } from '../systems/render/techGearQuads'
import { createExtractorDeploy, deployRefOf, stepExtractorDeploy } from './extractorDeploy'

const vehicle = vehicleWithPoints([{ id: 'drill.hood', atM: [0.5, 0.1], z: 7 }])

function hoodQuadsAt(fraction: number): GearQuad[] {
  return mountedGearQuadsOf(GEAR_ART, vehicle, { itemId: 'rig.containment', slot: null }, fraction)
}

function partOf(quads: readonly GearQuad[], partId: string): GearQuad {
  const quad = quads.find((candidate) => candidate.partId === partId)
  if (quad === undefined) throw new Error(`no ${partId}`)
  return quad
}

/** The hood's shell group, laid out folded as the piece draws it and joined to the drive. */
function heldShell() {
  const deploy = createExtractorDeploy()
  const group = new Group()
  deployRefOf(deploy, partOf(hoodQuadsAt(FOLDED), 'hood-shell'))?.(group)
  return { deploy, group }
}

describe('tech tree: the extractor fold-flat drive (ticket 297)', () => {
  it('turns an extractor part to the pose its work gives, as laying it out there would', () => {
    const { deploy, group } = heldShell()
    stepExtractorDeploy(deploy, 5, () => 0.5)
    const laidOut = pivotedQuadOf(partOf(hoodQuadsAt(0.5), 'hood-shell'))
    expect(group.rotation.z).toBeCloseTo(laidOut.turn)
    expect(group.position.x).toBeCloseTo(laidOut.pivot[0])
    expect(group.position.y).toBeCloseTo(laidOut.pivot[1])
  })

  it('reads the work once per authority tick', () => {
    const { deploy } = heldShell()
    const reads: string[] = []
    const fractionOf = (itemId: string) => (reads.push(itemId), 1)
    stepExtractorDeploy(deploy, 5, fractionOf)
    stepExtractorDeploy(deploy, 5, fractionOf)
    stepExtractorDeploy(deploy, 6, fractionOf)
    expect(reads).toEqual(['rig.containment', 'rig.containment'])
  })

  it('leaves fixed parts out of the drive and lets a part go when its group unmounts', () => {
    const deploy = createExtractorDeploy()
    expect(deployRefOf(deploy, partOf(hoodQuadsAt(FOLDED), 'hood-rail'))).toBeUndefined()
    const ref = deployRefOf(deploy, partOf(hoodQuadsAt(FOLDED), 'hood-shell'))
    ref?.(new Group())
    ref?.(null)
    expect(deploy.groups.size).toBe(0)
  })
})
