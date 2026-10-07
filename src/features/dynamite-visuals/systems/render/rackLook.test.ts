import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { slice } from '../../register'
import { rackMountOf, rackPartIdsOf, rackQuadsOf } from './rackLook'

const bolted = { isRackMounted: true, isDetonatorOpen: false }

describe('dynamite rack look', () => {
  it('shows nothing until the rack is bolted on', () => {
    expect(rackPartIdsOf({ ...bolted, isRackMounted: false, planetIndex: 40 })).toEqual([])
  })

  it('shows the frame and a stick for every size open on the planet, never a locked one', () => {
    // Sizes open from planet 7, one more every 3 planets (blastingCharges.sizes, K8 #218).
    expect(rackPartIdsOf({ ...bolted, planetIndex: 7 })).toEqual(['rack-frame', 'stick-1'])
    expect(rackPartIdsOf({ ...bolted, planetIndex: 15 })).toEqual([
      'rack-frame',
      'stick-1',
      'stick-2',
      'stick-3',
    ])
    expect(rackPartIdsOf({ ...bolted, planetIndex: 34 })).toContain('stick-10')
  })

  it('keeps the shipped size on a rack bolted on before planet 7, as the kernel lets it plant', () => {
    expect(rackPartIdsOf({ ...bolted, planetIndex: 1 })).toEqual(['rack-frame', 'stick-1'])
  })

  it('hangs the wire reel once the remote detonator is open', () => {
    const sight = { ...bolted, planetIndex: 22, isDetonatorOpen: true }
    expect(rackPartIdsOf(sight).at(-1)).toBe('wire-reel')
    expect(rackPartIdsOf({ ...sight, isDetonatorOpen: false })).not.toContain('wire-reel')
  })

  it('hangs at hull.rear through its registered attach use, and nowhere without the slice', () => {
    expect(withRegistrations([slice], rackMountOf)).toEqual({
      assetId: 'vehicle-dynamite-rack',
      attachId: 'hull.rear',
    })
    expect(withRegistrations([], rackMountOf)).toBeNull()
  })

  it("draws only the shown parts, with the frame's origin on the vehicle's hull.rear point", () => {
    const mount = withRegistrations([slice], rackMountOf)
    if (mount === null) throw new Error('the rack has no mount')
    const quads = rackQuadsOf(SHIPPED_ART, mount, ['rack-frame', 'stick-1'])
    expect(quads.map((quad) => quad.partId).sort()).toEqual(['rack-frame', 'stick-1'])
    const frame = quads.find((quad) => quad.partId === 'rack-frame')
    expect(frame?.pivot).toEqual([-0.58, -0.04])
  })
})
