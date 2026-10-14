import { describe, expect, it } from 'vitest'
import {
  createAnchorTilt,
  stepAnchorTilt,
  tiltAngleOf,
  TILT_EASE_TICKS,
  type AnchorReading,
  type AnchorTilt,
} from './anchorTilt'

// The ceiling anchor's look (GD ruling Q3, Q4 on #288): the bit tilts to the upward 45 degrees
// while an up-cut is latched, eases back to level over about 4 ticks, and the drop is the one step
// `isClinging` goes false mid up-cut.

const upCutting = (tick: number, isUpCutCellStanding = true): AnchorReading => ({
  tick,
  isClinging: true,
  upCutSide: 'right',
  isUpCutCellStanding,
})

const letGo = (tick: number): AnchorReading => ({
  tick,
  isClinging: false,
  upCutSide: null,
  isUpCutCellStanding: true,
})

/** Steps every reading in turn; the ticks the drop came on. */
function dropTicksOf(look: AnchorTilt, readings: readonly AnchorReading[]): number[] {
  return readings.filter((reading) => stepAnchorTilt(look, reading)).map((r) => r.tick)
}

const ticksFrom = (first: number, count: number) =>
  Array.from({ length: count }, (_, index) => first + index)

describe('ceiling anchor tilt', () => {
  it('tilts the bit to the upward 45 degrees on the up-cut side, eased in', () => {
    const look = createAnchorTilt()
    ticksFrom(1, TILT_EASE_TICKS).forEach((tick) => stepAnchorTilt(look, upCutting(tick)))
    expect(tiltAngleOf(look)).toBeCloseTo(-Math.PI / 4)
    const left = createAnchorTilt()
    ticksFrom(1, TILT_EASE_TICKS).forEach((tick) =>
      stepAnchorTilt(left, { ...upCutting(tick), upCutSide: 'left' }),
    )
    expect(tiltAngleOf(left)).toBeCloseTo(Math.PI / 4)
  })

  it('eases the bit back to level over 4 ticks once the anchor lets go', () => {
    const look = createAnchorTilt()
    ticksFrom(1, 8).forEach((tick) => stepAnchorTilt(look, upCutting(tick)))
    const tilts = ticksFrom(9, 5).map((tick) => {
      stepAnchorTilt(look, letGo(tick))
      return look.tilt
    })
    expect(tilts).toEqual([0.75, 0.5, 0.25, 0, 0])
  })

  it('drops exactly once, on the step clinging goes false mid up-cut', () => {
    const look = createAnchorTilt()
    const readings = [...ticksFrom(1, 6).map((t) => upCutting(t)), ...ticksFrom(7, 5).map(letGo)]
    expect(dropTicksOf(look, readings)).toEqual([7])
  })

  it('never drops while clinging across many up-cut cells, each cut in turn', () => {
    const look = createAnchorTilt()
    const readings = ticksFrom(1, 200).map((tick) => upCutting(tick, tick % 20 !== 0))
    expect(dropTicksOf(look, readings)).toEqual([])
  })

  it('does not drop when the anchor lets go between cells, with no cell mid-cut', () => {
    const look = createAnchorTilt()
    expect(dropTicksOf(look, [upCutting(1), upCutting(2, false), letGo(3)])).toEqual([])
  })

  it('does not drop when the anchor lets go with no up-cut latched', () => {
    const look = createAnchorTilt()
    const clinging = (tick: number): AnchorReading => ({ ...upCutting(tick), upCutSide: null })
    expect(dropTicksOf(look, [clinging(1), clinging(2), letGo(3)])).toEqual([])
  })

  it('starts level with no drop pending when the session starts over', () => {
    const look = createAnchorTilt()
    stepAnchorTilt(look, upCutting(50))
    expect(dropTicksOf(look, [letGo(1)])).toEqual([])
    expect(look.tilt).toBe(0)
  })
})
