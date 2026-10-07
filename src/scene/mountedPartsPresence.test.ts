import { describe, expect, it } from 'vitest'
import { mountedPartQuadsOf, type PartMount } from '../systems/render/mountedPartLook'
import { mountedPartsShown, showMountedParts } from './mountedPartsPresence'
import { SHIPPED_ART } from './shippedArt'

// What `vehicleParts().mounted` reports (#235): the mounts a vehicle piece has on the car now.

const SOUNDER: PartMount = { assetId: 'vehicle-item-power-echo-sounder', attachId: 'hull.roof.aft' }
const PERISCOPE: PartMount = {
  assetId: 'vehicle-item-passive-threat-periscope',
  attachId: 'hull.roof.fore',
}

const show = (mount: PartMount) => showMountedParts(mount, mountedPartQuadsOf(SHIPPED_ART, mount))

describe('mounted parts presence', () => {
  it('reports nothing while no piece mounts a part', () => {
    expect(mountedPartsShown()).toEqual([])
  })

  it('reports each mount with the part ids it draws, by attach point', () => {
    const takeBack = [show(PERISCOPE), show(SOUNDER)]
    const report = mountedPartsShown()
    takeBack.forEach((call) => call())
    expect(report).toEqual([
      { ...SOUNDER, partIds: ['sounder-hammer', 'sounder-horn'] },
      { ...PERISCOPE, partIds: ['periscope-mast', 'periscope-head'] },
    ])
  })

  it('forgets a mount once it is taken off the car', () => {
    show(SOUNDER)()
    expect(mountedPartsShown()).toEqual([])
  })
})
