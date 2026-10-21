import { describe, expect, it } from 'vitest'
import { SHIPPED_RIG_LOOKS } from '../rigLooks'
import { LARGEST_LOOK_PURCHASES, topStepOf } from './rigLookIndex'
import {
  createTrackLookFrames,
  everyLookFrameOf,
  lookFrameAt,
  type RigLookFrame,
  type TrackLookFrames,
} from './rigLookFrames'

const SWEEP = Array.from({ length: 10_001 }, (_, n) => n)

/** What the eye gets from a frame: the part, its colour, its glows and its plating. */
function shownOf(frame: RigLookFrame): string {
  return JSON.stringify([frame.partId, frame.tint, frame.glows, frame.plating])
}

/** Counts n (from 1 to 10,000) whose look the eye cannot tell from n - 1's, where it must. */
function unchangedNeighbours(frames: TrackLookFrames): number[] {
  const steps = frames.rows.steps.map((step) => step.from)
  const top = topStepOf(frames.rows).from
  return SWEEP.slice(1).filter(
    (n) =>
      (n >= top || steps.includes(n)) &&
      shownOf(lookFrameAt(frames, n)) === shownOf(lookFrameAt(frames, n - 1)),
  )
}

describe('rig look frames', () => {
  it('answers the same kept look for the same count, every time', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      for (const n of [0, 5, 100, 5000, 1e6]) {
        expect(lookFrameAt(frames, n)).toBe(lookFrameAt(frames, n))
      }
    }
  })

  it('shows the base look below the first step', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const below = SWEEP.filter((n) => n < frames.rows.steps[0].from)
      expect(new Set(below.map((n) => lookFrameAt(frames, n)))).toEqual(new Set([frames.base]))
      expect(frames.base).toMatchObject({ partId: null, tint: null, plating: null })
    }
  })

  it('changes the look at every step and at every purchase from the top step on', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      expect({ track: frames.rows.track, unchanged: unchangedNeighbours(frames) }).toEqual({
        track: frames.rows.track,
        unchanged: [],
      })
    }
  })

  it('changes the look where the palette, plating and glow laps all wrap at once', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const top = topStepOf(frames.rows).from
      for (const lap of [1, 2, 1000]) {
        const wrap = top + lap * frames.lap.length
        expect(shownOf(lookFrameAt(frames, wrap + 1))).not.toBe(shownOf(lookFrameAt(frames, wrap)))
      }
    }
  })

  it('keeps the top step exactly at the top count, the tail starting one purchase later', () => {
    for (const frames of SHIPPED_RIG_LOOKS.tracks) {
      const top = topStepOf(frames.rows).from
      expect(lookFrameAt(frames, top)).toBe(frames.steps.at(-1))
      expect(lookFrameAt(frames, top + 1)).toBe(frames.lap[0])
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

  it('walks the tint every tail step, the plating every palette lap, the glow every plating lap', () => {
    const frames = createTrackLookFrames({
      track: 'engine',
      slot: 'chassis.drive',
      glowSlots: [['piston']],
      glowCap: 'rigBody',
      steps: [{ from: 1, part: 'piston.2', card: null, colour: '#000000', glows: [0] }],
      tail: { delta: 1, palette: ['#000001', '#000002'], plating: ['a', 'b'], glow: [[1], [2]] },
    })
    const tail = [2, 3, 4, 5, 6].map((n) => lookFrameAt(frames, n))
    expect(tail.map((frame) => [frame.tint, frame.plating, frame.glows[0]])).toEqual([
      ['#000001', 'a', 1],
      ['#000002', 'a', 1],
      ['#000001', 'b', 1],
      ['#000002', 'b', 1],
      ['#000001', 'a', 2],
    ])
    expect(new Set(tail.map((frame) => frame.partId))).toEqual(new Set(['piston.2']))
  })

  it("carries a step's asset and hidden slot as a pure function of (track, n), tail included", () => {
    const steps = SHIPPED_RIG_LOOKS.tracks[0].rows.steps.map((step) => ({
      ...step,
      part: 'twin-drum-boiler',
      asset: 'vehicle-look-boiler',
    }))
    const rows = { ...SHIPPED_RIG_LOOKS.tracks[0].rows, replaces: 'boiler', steps }
    const frames = createTrackLookFrames(rows)
    const first = steps[0].from
    for (const n of SWEEP) {
      const frame = lookFrameAt(frames, n)
      expect(frame.assetId).toBe(n < first ? null : 'vehicle-look-boiler')
      expect(frame.replacesSlot).toBe(n < first ? null : 'boiler')
      expect(lookFrameAt(createTrackLookFrames(rows), n)).toEqual(frame)
    }
    expect(unchangedNeighbours(frames)).toEqual([])
  })

  it('leaves a vehicle step its own slot: no asset of its own, nothing hidden', () => {
    const steps = SHIPPED_RIG_LOOKS.tracks[0].rows.steps.map((step) => ({
      ...step,
      part: 't3-drill-bit',
    }))
    const frames = createTrackLookFrames({
      ...SHIPPED_RIG_LOOKS.tracks[0].rows,
      replaces: 'drill-bit',
      steps,
    })
    expect(lookFrameAt(frames, 101)).toMatchObject({ assetId: 'vehicle', replacesSlot: null })
    expect(shownOf(lookFrameAt(frames, 101))).not.toBe(shownOf(lookFrameAt(frames, 100)))
  })
})
