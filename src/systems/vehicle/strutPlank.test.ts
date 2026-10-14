import { describe, expect, it } from 'vitest'
import { STRUT_PLANK_LENGTH, STRUT_PLANK_THICKNESS } from '../../constants/physics'
import type { Vector2 } from './localFrame'
import { isPointOnPlank, strutPlankOf, type StrutPlank, type StrutSpan } from './strutPlank'

/** 200 m up the planet's +y axis, where the local up is within 0.3% of +y. */
const MOUTH = { tx: 0, ty: 200 }

function spanTo(pocketTx: number, pocketTy: number): StrutSpan {
  return { ...MOUTH, pocketTx, pocketTy }
}

function topCentreOf(plank: StrutPlank): Vector2 {
  return {
    x: plank.centre.x + plank.up.x * plank.halfThickness,
    y: plank.centre.y + plank.up.y * plank.halfThickness,
  }
}

/** The tile grid's quarter turn clockwise, (tx, ty) -> (ty, -tx - 1), and the same for points. */
function turnedSpan(span: StrutSpan): StrutSpan {
  return { tx: span.ty, ty: -span.tx - 1, pocketTx: span.pocketTy, pocketTy: -span.pocketTx - 1 }
}

describe('strut plank (ticket 379)', () => {
  it("lies across a downward bore's mouth with its top on the mouth's floor", () => {
    const plank = strutPlankOf(spanTo(0, 199))
    const top = topCentreOf(plank)
    expect(top.x).toBeCloseTo(0.5, 2)
    expect(top.y).toBeCloseTo(200, 2)
    expect(plank.along.x).toBeCloseTo(1, 2)
    expect(plank.halfLength * 2).toBe(STRUT_PLANK_LENGTH)
    expect(plank.halfThickness * 2).toBe(STRUT_PLANK_THICKNESS)
  })

  it("reaches a tile into the hollow from a level bore, at the mouth's floor", () => {
    const plank = strutPlankOf(spanTo(1, 200))
    const top = topCentreOf(plank)
    expect(top.x).toBeCloseTo(1, 2)
    expect(top.y).toBeCloseTo(200, 2)
    expect(top.x + plank.halfLength).toBeCloseTo(2, 2)
  })

  it('turns with the planet: a quarter-turned mouth gives the quarter-turned plank', () => {
    const plank = strutPlankOf(spanTo(1, 200))
    const turned = strutPlankOf(turnedSpan(spanTo(1, 200)))
    expect(turned.centre.x).toBeCloseTo(plank.centre.y, 9)
    expect(turned.centre.y).toBeCloseTo(-plank.centre.x, 9)
  })

  it('holds a point just under its top along its length, and nothing past its ends or above it', () => {
    const plank = strutPlankOf(spanTo(1, 200))
    const top = topCentreOf(plank)
    const under = (along: number, depth: number) => ({
      x: top.x + plank.along.x * along - plank.up.x * depth,
      y: top.y + plank.along.y * along - plank.up.y * depth,
    })
    expect(isPointOnPlank(plank, under(0.9, 0.1))).toBe(true)
    expect(isPointOnPlank(plank, under(-0.9, 0.1))).toBe(true)
    expect(isPointOnPlank(plank, under(1.1, 0.1))).toBe(false)
    expect(isPointOnPlank(plank, under(0, -0.05))).toBe(false)
    expect(isPointOnPlank(plank, under(0, STRUT_PLANK_THICKNESS + 0.05))).toBe(false)
  })
})
