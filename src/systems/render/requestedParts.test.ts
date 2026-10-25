import { describe, expect, it } from 'vitest'
import type { PartMotionRequest, PartMotionRequestSource } from '../registries/partMotionRequests'
import { createRequestedParts, foldPartRequests } from './requestedParts'

const bolt: PartMotionRequest = {
  kind: 'pose',
  attach: 'drill.housing',
  slots: ['motor-housing', 'drill-head'],
  x: 0.01,
  y: 0,
  angle: 0.2,
  glow: 0.5,
}

const nudge: PartMotionRequest = { ...bolt, attach: 'drill.head', slots: ['drill-head'], x: 0.02 }

const bigLevel: PartMotionRequest = {
  kind: 'swap',
  attach: 'hull.stack',
  partIds: ['t3-stack', 't2-stack-2'],
}

const boilerLook: PartMotionRequest = {
  kind: 'swap',
  attach: 'hull.boiler',
  partIds: ['drum'],
  assetId: 'vehicle-look-boiler',
  replacesSlot: 'boiler',
}

const hullLook: PartMotionRequest = {
  kind: 'swap',
  attach: 'hull.plates',
  partIds: ['plate'],
  assetId: 'vehicle-look-hull',
}

/** A drill-type look standing for the twin bit's own art (ticket 892). */
const twinBitLook: PartMotionRequest = {
  kind: 'swap',
  attach: 'drill.head',
  partIds: ['twin-bit-head'],
  assetId: 'vehicle-look-drill-type',
  replacesSlot: 'drill-bit',
  covers: ['gear.twin_bit'],
}

function sourceOf(id: string, requests: PartMotionRequest[]): PartMotionRequestSource {
  return { id, requestsNow: () => requests }
}

describe('requested parts', () => {
  it('adds every request on a slot together and lists the attach points they name', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [bolt]), sourceOf('b.two', [nudge])])
    expect(requested.poses.get('drill-head')).toEqual({ x: 0.03, y: 0, angle: 0.4, glow: 1 })
    expect(requested.poses.get('motor-housing')).toEqual({ x: 0.01, y: 0, angle: 0.2, glow: 0.5 })
    expect(requested.attach).toEqual(['drill.head', 'drill.housing'])
  })

  it('lets a pose go back to rest on the first step nobody asks for it', () => {
    const requested = createRequestedParts()
    const reacting = sourceOf('a.one', [bolt])
    foldPartRequests(requested, [reacting])
    foldPartRequests(requested, [])
    expect(requested.poses.get('drill-head')).toEqual({ x: 0, y: 0, angle: 0, glow: 0 })
    expect(requested.attach).toEqual([])
  })

  it('moves the swap version only when the swapped parts change', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel])])
    const afterSwap = requested.shownVersion
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel])])
    expect(requested.shownVersion).toBe(afterSwap)
    expect(requested.shownPartIds).toEqual(['t2-stack-2', 't3-stack'])
    foldPartRequests(requested, [])
    expect(requested.shownVersion).toBe(afterSwap + 1)
    expect(requested.shownPartIds).toEqual([])
  })

  it('folds a swap with no asset id, or the vehicle id, exactly as a vehicle swap', () => {
    const plain = createRequestedParts()
    const named = createRequestedParts()
    foldPartRequests(plain, [sourceOf('a.one', [bigLevel])])
    foldPartRequests(named, [sourceOf('a.one', [{ ...bigLevel, assetId: 'vehicle' }])])
    expect(named).toEqual(plain)
    expect(plain.shownLooks).toEqual([])
  })

  it("keeps another asset's swap apart from the vehicle parts, by point", () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel, hullLook, boilerLook])])
    expect(requested.shownPartIds).toEqual(['t2-stack-2', 't3-stack'])
    expect(requested.shownLooks).toEqual([boilerLook, hullLook])
    expect(requested.attach).toEqual(['hull.boiler', 'hull.plates', 'hull.stack'])
  })

  it('moves the swap version once when a look starts, never for an equal rebuilt request', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [])
    const before = requested.shownVersion
    foldPartRequests(requested, [sourceOf('a.one', [boilerLook])])
    for (let step = 0; step < 50; step++) {
      foldPartRequests(requested, [sourceOf('a.one', [{ ...boilerLook, partIds: ['drum'] }])])
    }
    expect(requested.shownVersion).toBe(before + 1)
    foldPartRequests(requested, [sourceOf('a.one', [{ ...boilerLook, replacesSlot: undefined }])])
    expect(requested.shownVersion).toBe(before + 2)
  })

  it('holds no covered item while no swap names covers', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel, hullLook, boilerLook])])
    expect(requested.coveredItemIds).toEqual([])
  })

  it('carries the items a showing swap covers, and lets them go when it stops showing', () => {
    const requested = createRequestedParts()
    const covering = sourceOf('a.one', [twinBitLook, { ...bigLevel, covers: ['gear.reach_boom'] }])
    foldPartRequests(requested, [covering])
    expect(requested.coveredItemIds).toEqual(['gear.reach_boom', 'gear.twin_bit'])
    expect(requested.shownLooks).toEqual([twinBitLook])
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel])])
    expect(requested.coveredItemIds).toEqual([])
  })

  it('folds a look the same with or without covers, but for the items it covers', () => {
    const plain = createRequestedParts()
    const covering = createRequestedParts()
    foldPartRequests(plain, [sourceOf('a.one', [{ ...twinBitLook, covers: undefined }])])
    foldPartRequests(covering, [sourceOf('a.one', [twinBitLook])])
    expect({ ...covering, shownLooks: plain.shownLooks, coveredItemIds: [] }).toEqual(plain)
  })

  it('moves the swap version when only the covers of a look change', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [twinBitLook])])
    const before = requested.shownVersion
    foldPartRequests(requested, [sourceOf('a.one', [{ ...twinBitLook }])])
    expect(requested.shownVersion).toBe(before)
    foldPartRequests(requested, [sourceOf('a.one', [{ ...twinBitLook, covers: [] }])])
    expect(requested.shownVersion).toBe(before + 1)
  })
})
