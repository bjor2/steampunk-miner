import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { slice } from '../../register'
import { radiusGrowthOf } from './chargeTypeLook'
import { rackMountOf, rackPartIdsOf, rackQuadsOf, stockOfType, type RackSight } from './rackLook'

// The GD lock of 25 Oct on #647 (D7, ticket 866): a rack socket with a slot per type and stock
// pips. A bay shows once a size of its type is open on the planet; its pips light one per charge
// of the type carried; the reel and plunger come with the remote detonator, the nozzle with the
// Blast Casing node; the bundles grow with the Blast Radius band (#869).

const bolted: RackSight = {
  isRackMounted: true,
  planetIndex: 7,
  isDetonatorOpen: false,
  carriedBySize: {},
  radiusLevel: 0,
  isBlastCasingOwned: false,
}

const pips = (type: number, count: number) =>
  Array.from({ length: count }, (_, at) => `pip-${type}-${at + 1}`)

describe('dynamite rack look', () => {
  it('shows nothing until the rack is bolted on', () => {
    expect(rackPartIdsOf({ ...bolted, isRackMounted: false, planetIndex: 40 })).toEqual([])
  })

  it('shows the frame and a bay for every type with a size open on the planet, never a locked type', () => {
    // Sizes open from planet 7, one more every 3 planets: size 5 (type 2) on P19, size 9 (type 3) on P31.
    expect(rackPartIdsOf({ ...bolted, planetIndex: 7 })).toEqual(['rack-frame', 'slot-1'])
    expect(rackPartIdsOf({ ...bolted, planetIndex: 18 })).toEqual(['rack-frame', 'slot-1'])
    expect(rackPartIdsOf({ ...bolted, planetIndex: 19 })).toEqual([
      'rack-frame',
      'slot-1',
      'slot-2',
    ])
    expect(rackPartIdsOf({ ...bolted, planetIndex: 31 })).toContain('slot-3')
  })

  it('keeps the shipped size on a rack bolted on before planet 7, as the kernel lets it plant', () => {
    expect(rackPartIdsOf({ ...bolted, planetIndex: 1 })).toEqual(['rack-frame', 'slot-1'])
  })

  it('lights one pip per charge of the type carried, whatever its size, up to the rack’s eight', () => {
    const carriedBySize = { '1': 2, '3': 1, '5': 3, '9': 11 }
    expect([1, 2, 3].map((type) => stockOfType(carriedBySize, type))).toEqual([3, 3, 11])
    expect(rackPartIdsOf({ ...bolted, planetIndex: 40, carriedBySize })).toEqual([
      'rack-frame',
      'slot-1',
      ...pips(1, 3),
      'slot-2',
      ...pips(2, 3),
      'slot-3',
      ...pips(3, 8),
    ])
  })

  it('hangs the wire reel and the plunger once the remote detonator is open', () => {
    const sight = { ...bolted, planetIndex: 22, isDetonatorOpen: true }
    expect(rackPartIdsOf(sight).slice(-2)).toEqual(['wire-reel', 'plunger'])
    expect(rackPartIdsOf({ ...sight, isDetonatorOpen: false })).not.toContain('plunger')
  })

  it('hangs the casing nozzle once the Blast Casing node is owned', () => {
    expect(rackPartIdsOf({ ...bolted, isBlastCasingOwned: true }).at(-1)).toBe('casing-nozzle')
    expect(rackPartIdsOf(bolted)).not.toContain('casing-nozzle')
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
    const quads = rackQuadsOf(SHIPPED_ART, mount, ['rack-frame', 'slot-1'], 0)
    expect(quads.map((quad) => quad.partId).sort()).toEqual(['rack-frame', 'slot-1'])
    const frame = quads.find((quad) => quad.partId === 'rack-frame')
    expect(frame?.pivot).toEqual([-0.58, -0.04])
  })

  it('grows the bays’ bundles with the Blast Radius band about their pivot, the frame unmoved', () => {
    const mount = withRegistrations([slice], rackMountOf)
    if (mount === null) throw new Error('the rack has no mount')
    const shown = ['rack-frame', 'slot-1', 'pip-1-1']
    const level0 = rackQuadsOf(SHIPPED_ART, mount, shown, 0)
    const level10 = rackQuadsOf(SHIPPED_ART, mount, shown, 10)
    const growth = radiusGrowthOf(10)
    const slot0 = level0.find((quad) => quad.partId === 'slot-1')!
    const slot10 = level10.find((quad) => quad.partId === 'slot-1')!
    expect(slot10.size).toEqual([slot0.size[0] * growth, slot0.size[1] * growth])
    expect(slot10.pivot).toEqual(slot0.pivot)
    expect(level10.filter((quad) => quad.partId !== 'slot-1')).toEqual(
      level0.filter((quad) => quad.partId !== 'slot-1'),
    )
  })
})
