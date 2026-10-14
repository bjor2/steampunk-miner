import { describe, expect, it } from 'vitest'
import {
  EMPTY_CASING_TRAIL,
  followCasingTrail,
  followCasingTrailAlongCut,
  type CasingTrail,
} from './casingTrail'

/** The stamp's centre moved through `xs` (mm, at y 0), collecting the x of each ring due. */
function followAlongX(xs: readonly number[], isCutting = true, start = EMPTY_CASING_TRAIL) {
  let trail: CasingTrail = start
  const due: number[] = []
  for (const x of xs) {
    const step = followCasingTrail(trail, { xMm: x, yMm: 0 }, isCutting)
    trail = step.trail
    due.push(...step.due.map((point) => point.xMm))
  }
  return { trail, due }
}

/** 0, step, 2 step ... up to `toMm`. */
function stepsTo(toMm: number, stepMm: number): number[] {
  return Array.from({ length: Math.floor(toMm / stepMm) + 1 }, (_, index) => index * stepMm)
}

describe('casing trail', () => {
  it('records the stamp centre every half metre it cuts', () => {
    const { trail } = followAlongX(stepsTo(2000, 100))
    expect(trail.unlined.map((point) => point.xMm)).toEqual([0, 500, 1000, 1500, 2000])
  })

  it('lays each ring only once the stamp is 2.15 m past it, oldest first', () => {
    const { due, trail } = followAlongX(stepsTo(5000, 100))
    expect(due).toEqual([0, 500, 1000, 1500, 2000, 2500])
    expect(trail.unlined.map((point) => point.xMm)).toEqual([3000, 3500, 4000, 4500, 5000])
  })

  it('lays one ring per half metre of a 20 m cut once the stamp is past each', () => {
    expect(followAlongX(stepsTo(22200, 100)).due.slice(1)).toHaveLength(40)
  })

  it('records nothing while the drill is not cutting', () => {
    const { trail, due } = followAlongX(stepsTo(5000, 100), false)
    expect(trail).toEqual(EMPTY_CASING_TRAIL)
    expect(due).toEqual([])
  })

  it('lays the last rings of a cut as the vehicle backs out without drilling', () => {
    const cut = followAlongX(stepsTo(2000, 100))
    const backedOut = followAlongX([-200, -2200], false, cut.trail)
    expect(cut.due).toEqual([])
    expect(backedOut.due).toEqual([2000, 0, 500, 1000, 1500])
    expect(backedOut.trail.unlined).toEqual([])
  })

  it('lays the oldest points past six when the stamp dithers inside the lag', () => {
    const { trail, due } = followAlongX([0, 600, 0, 600, 0, 600, 0, 600])
    expect(trail.unlined).toHaveLength(6)
    expect(due).toEqual([0, 600])
  })

  it('gives each ring the stretch of axis cut since the previous one', () => {
    const lengthsAt = (stepMm: number) =>
      followAlongX(stepsTo(2000, stepMm)).trail.unlined.map((point) => point.lengthMm)
    expect(lengthsAt(100)).toEqual([500, 500, 500, 500, 500])
    expect(lengthsAt(1000)).toEqual([500, 1000, 1000])
  })

  it('gives the first ring of a new cut one ring spacing, however far the vehicle travelled', () => {
    const cut = followAlongX([0], true)
    const travelled = followAlongX([10000, 10500], false, cut.trail)
    const resumed = followAlongX([20000], true, travelled.trail)
    expect(resumed.trail.unlined.map((point) => point.lengthMm)).toEqual([500])
  })
})

describe('casing trail along the swept cut (ticket 330)', () => {
  function followCutAlongX(stepMm: number, toMm: number) {
    let trail: CasingTrail = EMPTY_CASING_TRAIL
    for (const x of stepsTo(toMm, stepMm)) {
      trail = followCasingTrailAlongCut(trail, cutTo(x, stepMm), true).trail
    }
    return trail
  }

  /** A swept cut that ran `stepMm` along x to `x`, its start no further back than 0. */
  const cutTo = (x: number, stepMm: number) => ({
    from: { xMm: Math.max(0, x - stepMm), yMm: 0 },
    to: { xMm: x, yMm: 0 },
  })

  /** The x of each ring due, cutting along x at `stepMm` a tick to `toMm`. */
  function dueAlongX(stepMm: number, toMm: number): number[] {
    let trail: CasingTrail = EMPTY_CASING_TRAIL
    const due: number[] = []
    for (const x of stepsTo(toMm, stepMm)) {
      const step = followCasingTrailAlongCut(trail, cutTo(x, stepMm), true)
      trail = step.trail
      due.push(...step.due.map((point) => point.xMm))
    }
    return due
  }

  it.each([60, 300, 290])('records a point every half metre at %i mm a step', (stepMm) => {
    const trail = followCutAlongX(stepMm, 2000)
    const xs = [...trail.unlined.map((point) => point.xMm)]
    expect(xs.slice(0, 4)).toEqual([0, 500, 1000, 1500])
    for (const point of trail.unlined.slice(1)) expect(point.lengthMm).toBe(500)
  })

  it('leaves no gap and charges no lag at 18 m/s, 300 mm a tick', () => {
    const due = dueAlongX(300, 30000)
    const gaps = due.slice(1).map((x, index) => x - due[index])
    expect(due.length).toBeGreaterThan(50)
    expect(new Set(gaps)).toEqual(new Set([500]))
  })

  // Ticket 335: 60, 240 and 960 m/s are 1, 4 and 16 m a tick.
  it.each([1000, 4000, 16000])(
    'lays the rings due half a metre apart, in order, at %i mm a tick',
    (stepMm) => {
      const due = dueAlongX(stepMm, 96000)
      const gaps = due.slice(1).map((x, index) => x - due[index])
      expect(due.length).toBeGreaterThan(150)
      expect(new Set(gaps)).toEqual(new Set([500]))
    },
  )

  it('starts a new cut where the sweep starts past the ring lag of the last point', () => {
    const start = followCasingTrailAlongCut(EMPTY_CASING_TRAIL, cutTo(0, 0), true).trail
    const far = followCasingTrailAlongCut(start, cutTo(9000, 0), true).trail
    expect(far.lastAxisPoint).toEqual({ xMm: 9000, yMm: 0 })
  })
})
