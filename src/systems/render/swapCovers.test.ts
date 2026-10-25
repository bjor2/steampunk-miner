import { describe, expect, it } from 'vitest'
import type { PartSwapRequest } from '../registries/partMotionRequests'
import { coveredItemIdsOf, isPointHeldBesides, type PointHolder } from './swapCovers'

const twinBitLook: PartSwapRequest = {
  kind: 'swap',
  attach: 'drill.head',
  partIds: ['twin-bit-head'],
  covers: ['gear.twin_bit'],
}

const cutterLook: PartSwapRequest = {
  kind: 'swap',
  attach: 'drill.head',
  partIds: ['cutter-yoke'],
  covers: ['gear.side_cutters', 'gear.twin_bit'],
}

const plainLook: PartSwapRequest = { kind: 'swap', attach: 'hull.boiler', partIds: ['drum'] }

const twinBitArt: PointHolder = { attachId: 'drill.head', itemIds: ['gear.twin_bit'] }
const moduleOnHead: PointHolder = { attachId: 'drill.head', itemIds: [] }

describe('swap covers', () => {
  it('covers nothing while no swap names covers', () => {
    expect(coveredItemIdsOf([plainLook])).toEqual([])
    expect(coveredItemIdsOf([])).toEqual([])
  })

  it('lists every covered item once, sorted, over every showing swap', () => {
    expect(coveredItemIdsOf([twinBitLook, plainLook, cutterLook])).toEqual([
      'gear.side_cutters',
      'gear.twin_bit',
    ])
  })

  it('writes over the kept list it is given rather than adding to it', () => {
    const kept = ['gear.reach_boom']
    expect(coveredItemIdsOf([twinBitLook], kept)).toBe(kept)
    expect(kept).toEqual(['gear.twin_bit'])
  })

  it('takes a point held only by the art of the items the swap covers', () => {
    expect(isPointHeldBesides([twinBitArt], 'drill.head', ['gear.twin_bit'])).toBe(false)
  })

  it('yields a point to any other item, so a module still wins its slot', () => {
    expect(isPointHeldBesides([twinBitArt], 'drill.head', ['gear.side_cutters'])).toBe(true)
    expect(isPointHeldBesides([twinBitArt], 'drill.head', [])).toBe(true)
    const shared = { attachId: 'drill.head', itemIds: ['gear.twin_bit', 'gear.reach_boom'] }
    expect(isPointHeldBesides([shared], 'drill.head', ['gear.twin_bit'])).toBe(true)
  })

  it('yields a point to a part no item owns, whatever the swap covers', () => {
    expect(isPointHeldBesides([moduleOnHead], 'drill.head', ['gear.twin_bit'])).toBe(true)
  })

  it('reads only the holders of its own point', () => {
    expect(isPointHeldBesides([moduleOnHead], 'hull.boiler', [])).toBe(false)
  })
})
