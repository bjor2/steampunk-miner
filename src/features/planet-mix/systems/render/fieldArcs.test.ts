import { describe, expect, it } from 'vitest'
import type { MagneticField } from '../magneticFields'
import { apexOf, fieldArcsNearest, type FieldArc } from './fieldArcs'
import { MAGNETIC_LOOKS } from './magneticLooks'

const LOOK = MAGNETIC_LOOKS.fieldLines
const LOBES_PER_VEIN = LOOK.lobeBendShares.length * 2
const ORIGIN = { x: 0, y: 0 }

function fieldAt(tx: number, ty: number, radiusTiles = 6, band = 2): MagneticField {
  return { band, vein: { tx, ty }, radiusTiles }
}

function endsOf(arc: FieldArc): string {
  return [arc.from.x, arc.from.y, arc.to.x, arc.to.y, arc.bendM].map((n) => n.toFixed(6)).join()
}

describe('field arcs', () => {
  it('bows each of a lone vein’s lines out on both sides between poles across its centre', () => {
    const arcs = fieldArcsNearest([fieldAt(10, 20)], ORIGIN, 99)
    expect(arcs).toHaveLength(LOBES_PER_VEIN)
    arcs.forEach((arc) => {
      expect((arc.from.x + arc.to.x) / 2).toBeCloseTo(10.5, 6)
      expect((arc.from.y + arc.to.y) / 2).toBeCloseTo(20.5, 6)
      expect(Math.hypot(arc.to.x - arc.from.x, arc.to.y - arc.from.y)).toBeCloseTo(
        2 * 6 * LOOK.lobeReachShare,
        6,
      )
    })
    expect(arcs.map((arc) => arc.bendM).sort((a, b) => a - b)).toEqual(
      [...LOOK.lobeBendShares.map((share) => -share * 6), ...LOOK.lobeBendShares.map((s) => s * 6)]
        .sort((a, b) => a - b)
        .map((bend) => expect.closeTo(bend, 9)),
    )
  })

  it('joins two veins whose fields touch with a line bowing each way between them', () => {
    const arcs = fieldArcsNearest([fieldAt(0, 0), fieldAt(10, 0)], ORIGIN, 99)
    const joining = arcs.filter((arc) => arc.from.x === 0.5 && arc.to.x === 10.5)
    expect(arcs).toHaveLength(2 * LOBES_PER_VEIN + 2)
    expect(joining.map((arc) => arc.bendM)).toEqual(
      expect.arrayContaining([10 * LOOK.pairBendShare, -10 * LOOK.pairBendShare]),
    )
  })

  it('never joins veins whose fields do not reach each other', () => {
    expect(fieldArcsNearest([fieldAt(0, 0), fieldAt(13, 0)], ORIGIN, 99)).toHaveLength(
      2 * LOBES_PER_VEIN,
    )
  })

  it('keeps at most the cap, the arcs whose middles lie nearest the rig', () => {
    const fields = [fieldAt(0, 0), fieldAt(100, 0), fieldAt(200, 0)]
    const rig = { x: 200, y: 0 }
    const kept = fieldArcsNearest(fields, rig, LOBES_PER_VEIN)
    expect(kept).toHaveLength(LOBES_PER_VEIN)
    kept.forEach((arc) => expect(Math.abs(apexOf(arc).x - 200.5)).toBeLessThan(10))
  })

  it('gives the same lines whatever order the fields stream in', () => {
    const fields = [fieldAt(0, 0), fieldAt(9, 3), fieldAt(4, 11, 5, 3)]
    const forward = fieldArcsNearest(fields, ORIGIN, 99).map(endsOf).sort()
    const backward = fieldArcsNearest([...fields].reverse(), ORIGIN, 99)
      .map(endsOf)
      .sort()
    expect(backward).toEqual(forward)
  })

  it('turns each vein’s poles by its own hash, so neighbouring veins point different ways', () => {
    const [first] = fieldArcsNearest([fieldAt(0, 0)], ORIGIN, 1)
    const [second] = fieldArcsNearest([fieldAt(40, 0)], { x: 40, y: 0 }, 1)
    const angleOf = (arc: FieldArc) => Math.atan2(arc.to.y - arc.from.y, arc.to.x - arc.from.x)
    expect(angleOf(first)).not.toBeCloseTo(angleOf(second), 3)
  })
})
