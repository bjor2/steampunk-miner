import { describe, expect, it } from 'vitest'
import { SHIPPED_RIG_LOOKS } from '../rigLooks'
import { RIG_LOOK_TABLE } from '../rigLookTable'
import { LARGEST_LOOK_PURCHASES, rigLookIndexOf, topStepOf } from './rigLookIndex'
import {
  createTrackLookFrames,
  everyLookFrameOf,
  lookFrameAt,
  type RigLookFrame,
  type TrackLookFrames,
} from './rigLookFrames'

const SWEEP = Array.from({ length: 10_001 }, (_, n) => n)

/** What the eye gets from a frame: the part, its colour, its glows, its finish and its pips. */
function shownOf(frames: TrackLookFrames, n: number): string {
  const frame: RigLookFrame = lookFrameAt(frames, n)
  const { pips } = rigLookIndexOf(frames.rows, n)
  return JSON.stringify([frame.partId, frame.tint, frame.glows, frame.finish, pips])
}

/** Band edges (from 1 to 10,000) whose look the eye cannot tell from the count before's. */
function unchangedEdges(frames: TrackLookFrames): number[] {
  const { step } = frames.rows.band
  const edges = SWEEP.slice(1).filter((n) => n % step === 0)
  return edges.filter((n) => shownOf(frames, n) === shownOf(frames, n - 1))
}

describe('rig look frames', () => {
  it('answers the same kept look for the same count, every time', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      for (const n of [0, 5, 100, 5000, 1e6]) {
        expect(lookFrameAt(frames, n)).toBe(lookFrameAt(frames, n))
      }
    }
  })

  it('shows the base look below the first edge', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const below = SWEEP.filter((n) => n < frames.rows.band.edges[0])
      expect(new Set(below.map((n) => lookFrameAt(frames, n)))).toEqual(new Set([frames.base]))
      expect(frames.base).toMatchObject({ partId: null, tint: null, finish: null, bandName: null })
    }
  })

  it('changes the look at every band edge and nowhere inside a band', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      expect({ track: frames.rows.track, unchanged: unchangedEdges(frames) }).toEqual({
        track: frames.rows.track,
        unchanged: [],
      })
      const inside = SWEEP.slice(1).filter((n) => n % frames.rows.band.step !== 0)
      expect(inside.filter((n) => shownOf(frames, n) !== shownOf(frames, n - 1))).toEqual([])
    }
  })

  it('changes the finish, a material, at every band past the art, its wrap included', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const top = topStepOf(frames.rows).from
      const { step } = frames.rows.band
      for (const lap of [0, 1, 2, 1000]) {
        const wrap = top + (lap * frames.lap.length + 1) * step
        expect(lookFrameAt(frames, wrap).finish).not.toBe(lookFrameAt(frames, wrap - step).finish)
      }
    }
  })

  it('keeps the top step on its edge, the first finish one band later', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const top = topStepOf(frames.rows).from
      expect(lookFrameAt(frames, top)).toBe(frames.steps.at(-1))
      expect(lookFrameAt(frames, top + frames.rows.band.step)).toBe(frames.lap[0])
    }
  })

  it('wears each finish over the top step’s part and glows, named for the hover', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const top = frames.steps.at(-1)!
      for (const frame of frames.lap) {
        expect(frame).toMatchObject({ partId: top.partId, glows: top.glows })
        expect(frame.bandName).toBe(RIG_LOOK_TABLE.finishes[frame.finish!].name)
        expect(frame.tint).toBe(RIG_LOOK_TABLE.finishes[frame.finish!].colour)
      }
    }
  })

  it('holds a bounded set of looks whatever the count', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const shown = new Set(SWEEP.map((n) => lookFrameAt(frames, n)))
      expect(shown.size).toBeLessThanOrEqual(everyLookFrameOf(frames).length)
      for (const frame of shown) expect(everyLookFrameOf(frames)).toContain(frame)
    }
  })

  it('answers a look for a million purchases, 2^31 - 1, NaN and -1', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const looks = [1e6, LARGEST_LOOK_PURCHASES, Number.NaN, -1].map((n) => lookFrameAt(frames, n))
      expect(looks.slice(2)).toEqual([frames.base, frames.base])
      expect(everyLookFrameOf(frames)).toContain(looks[0])
      expect(everyLookFrameOf(frames)).toContain(looks[1])
    }
  })

  it("carries a step's asset and hidden slot as a pure function of (track, n), finishes included", () => {
    const shipped = SHIPPED_RIG_LOOKS.tracks[0].rows
    const steps = shipped.steps.map((step) => ({
      ...step,
      part: 'twin-drum-boiler',
      asset: 'vehicle-look-boiler',
    }))
    const rows = { ...shipped, replaces: 'boiler', steps }
    const frames = createTrackLookFrames(rows, RIG_LOOK_TABLE.finishes)
    const first = steps[0].from
    for (const n of SWEEP) {
      const frame = lookFrameAt(frames, n)
      expect(frame.assetId).toBe(n < first ? null : 'vehicle-look-boiler')
      expect(frame.replacesSlot).toBe(n < first ? null : 'boiler')
      expect(lookFrameAt(createTrackLookFrames(rows, RIG_LOOK_TABLE.finishes), n)).toEqual(frame)
    }
    expect(unchangedEdges(frames)).toEqual([])
  })

  it('leaves a vehicle step its own slot: no asset of its own, nothing hidden', () => {
    const shipped = SHIPPED_RIG_LOOKS.tracks[0].rows
    const steps = shipped.steps.map((step) => ({ ...step, part: 't3-drill-bit' }))
    const frames = createTrackLookFrames(
      { ...shipped, replaces: 'drill-bit', steps },
      RIG_LOOK_TABLE.finishes,
    )
    const past = topStepOf(frames.rows).from + frames.rows.band.step
    expect(lookFrameAt(frames, past)).toMatchObject({ assetId: 'vehicle', replacesSlot: null })
    expect(shownOf(frames, past)).not.toBe(shownOf(frames, past - 1))
  })
})
