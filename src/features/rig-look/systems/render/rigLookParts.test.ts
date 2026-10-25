import { describe, expect, it } from 'vitest'
import type { PartMotionRequestSource } from '../../../../systems/registries/partMotionRequests'
import {
  createRequestedParts,
  foldPartRequests,
  type RequestedParts,
} from '../../../../systems/render/requestedParts'
import type { TrackLookRows } from './rigLookIndex'
import { createTrackLookFrames as createFramesOf, lookFrameAt } from './rigLookFrames'
import { bandEvery, FIXTURE_FINISHES } from './rigLookFixtures'
import { isSwappingParts, partSwapsOf } from './rigLookParts'

function createTrackLookFrames(rows: TrackLookRows) {
  return createFramesOf(rows, FIXTURE_FINISHES)
}

function rowsOf(track: string, slot: string, parts: readonly (string | null)[]): TrackLookRows {
  return {
    track,
    slot,
    glowSlots: [['drill-bit']],
    glowCap: 'drillNose',
    steps: parts.map((part, at) => ({
      from: (at + 1) * 10,
      part,
      card: null,
      colour: `#00000${at + 3}`,
      glows: [0],
    })),
    band: bandEvery(10, parts.length),
  }
}

const TIP = createTrackLookFrames(rowsOf('drill_tip', 'drill.head', ['tip-cone', 'tip-crown']))
const HOLD = createTrackLookFrames(rowsOf('cargo_hold', 'hull.cargo', ['crate']))
const ENGINE = createTrackLookFrames(rowsOf('engine', 'chassis.drive', [null]))

/** Steps at 10 and 20 cut from a look asset, standing in the rig's boiler. */
const BOILER = createTrackLookFrames({
  ...rowsOf('boiler', 'hull.boiler', ['kettle-boiler', 'twin-drum-boiler']),
  replaces: 'boiler',
  steps: rowsOf('boiler', 'hull.boiler', ['kettle-boiler', 'twin-drum-boiler']).steps.map(
    (step) => ({ ...step, asset: 'vehicle-look-boiler' }),
  ),
})

/** A drill-type look on the head standing for the twin bit's own art (ticket 892). */
const TWIN_BIT = createTrackLookFrames({
  ...rowsOf('gear.twin_bit', 'drill.head', [null, 'twin-bit-head']),
  covers: ['gear.twin_bit'],
})

const TWIN_BIT_ART = { attachId: 'drill.head', itemIds: ['gear.twin_bit'] }

/** The swap source as the scene runs it, over one owned count the spec moves. */
function boilerSourceAt(owned: { n: number }): PartMotionRequestSource {
  return { id: 'rig-look.spec', requestsNow: () => partSwapsOf([lookFrameAt(BOILER, owned.n)], []) }
}

/** How many times the drawn car rebuilt its parts while `counts` were owned in turn. */
function swapsOver(requested: RequestedParts, counts: readonly number[]): number {
  const owned = { n: 0 }
  const source = boilerSourceAt(owned)
  foldPartRequests(requested, [source])
  const before = requested.shownVersion
  for (const n of counts) {
    owned.n = n
    foldPartRequests(requested, [source])
  }
  return requested.shownVersion - before
}

describe('rig look parts', () => {
  it("swaps each owned step's part onto its track's own point", () => {
    const owned = [lookFrameAt(TIP, 25), lookFrameAt(HOLD, 10)]
    expect(partSwapsOf(owned, [])).toEqual([
      { kind: 'swap', attach: 'drill.head', partIds: ['tip-crown'] },
      { kind: 'swap', attach: 'hull.cargo', partIds: ['crate'] },
    ])
  })

  it('keeps the top part through the tail', () => {
    expect(partSwapsOf([lookFrameAt(TIP, 5000)], [])[0].partIds).toEqual(['tip-crown'])
  })

  it('swaps nothing on the base look or a step whose part is not in yet', () => {
    const owned = [lookFrameAt(TIP, 0), lookFrameAt(ENGINE, 99)]
    expect(partSwapsOf(owned, [])).toEqual([])
    expect(isSwappingParts(owned)).toBe(false)
  })

  it('yields a point a fitted module or item draws at, leaving the other tracks swapped', () => {
    const owned = [lookFrameAt(TIP, 25), lookFrameAt(HOLD, 10)]
    expect(partSwapsOf(owned, [{ attachId: 'drill.head', itemIds: [] }])).toEqual([
      { kind: 'swap', attach: 'hull.cargo', partIds: ['crate'] },
    ])
  })

  it('never asks for a point other than its own track slot', () => {
    const owned = [lookFrameAt(TIP, 10), lookFrameAt(TIP, 300), lookFrameAt(HOLD, 70)]
    const points = partSwapsOf(owned, []).map((swap) => swap.attach)
    expect(new Set(points)).toEqual(new Set(['drill.head', 'hull.cargo']))
  })

  it('answers a kept request for the same owned look', () => {
    const owned = [lookFrameAt(HOLD, 10)]
    expect(partSwapsOf(owned, [])[0]).toBe(partSwapsOf(owned, [])[0])
  })

  it('names the look asset and the slot it hides for a step cut from a look asset', () => {
    expect(partSwapsOf([lookFrameAt(BOILER, 20)], [])).toEqual([
      {
        kind: 'swap',
        attach: 'hull.boiler',
        partIds: ['twin-drum-boiler'],
        assetId: 'vehicle-look-boiler',
        replacesSlot: 'boiler',
      },
    ])
  })

  it('swaps once for a 50-purchase burst, ending on the look of (track, n)', () => {
    const requested = createRequestedParts()
    expect(swapsOver(requested, [50])).toBe(1)
    const [shown] = requested.shownLooks
    const owned = lookFrameAt(BOILER, 50)
    expect([shown.assetId, shown.partIds, shown.replacesSlot]).toEqual([
      owned.assetId,
      [owned.partId],
      owned.replacesSlot,
    ])
  })

  it('rebuilds the car only where a step changes the part, never on a tail purchase', () => {
    const oneByOne = Array.from({ length: 50 }, (_, at) => at + 1)
    expect(swapsOver(createRequestedParts(), oneByOne)).toBe(2)
    const tail = Array.from({ length: 50 }, (_, at) => at + 21)
    expect(swapsOver(createRequestedParts(), [20, ...tail])).toBe(1)
  })

  it('carries a covering track’s items on its swap, and no covers on any other', () => {
    expect(partSwapsOf([lookFrameAt(TWIN_BIT, 20), lookFrameAt(HOLD, 10)], [])).toEqual([
      { kind: 'swap', attach: 'drill.head', partIds: ['twin-bit-head'], covers: ['gear.twin_bit'] },
      { kind: 'swap', attach: 'hull.cargo', partIds: ['crate'] },
    ])
  })

  it('covers nothing on a step whose part is not in yet', () => {
    expect(lookFrameAt(TWIN_BIT, 10).covers).toEqual([])
    expect(partSwapsOf([lookFrameAt(TWIN_BIT, 10)], [TWIN_BIT_ART])).toEqual([])
  })

  it('takes the point held only by the art of the item it covers', () => {
    expect(partSwapsOf([lookFrameAt(TWIN_BIT, 20)], [TWIN_BIT_ART])).toHaveLength(1)
  })

  it('still yields to every other item, so a module wins its slot', () => {
    const tipOverTwinBit = partSwapsOf([lookFrameAt(TIP, 25)], [TWIN_BIT_ART])
    const twinBitOverModule = partSwapsOf(
      [lookFrameAt(TWIN_BIT, 20)],
      [{ attachId: 'drill.head', itemIds: [] }],
    )
    expect([tipOverTwinBit, twinBitOverModule]).toEqual([[], []])
  })
})
