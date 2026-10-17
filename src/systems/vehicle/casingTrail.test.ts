import { describe, expect, it } from 'vitest'
import { CASING_RING_LAG_MM, CASING_RING_SPACING_MM } from '../../constants/balance'
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

  it('records nothing new and lays nothing while the stamp dithers inside the lag (#538)', () => {
    const { trail, due } = followAlongX([0, 600, 0, 600, 0, 600, 0, 600])
    expect(trail.unlined.map((point) => point.xMm)).toEqual([0, 600])
    expect(due).toEqual([])
  })

  it('drops a point within half a metre of one waiting, folding its stretch into no ring', () => {
    const { trail } = followAlongX([0, 500, 1000, 1500, 1000, 500, 0, -500])
    expect(trail.unlined.map((point) => [point.xMm, point.lengthMm])).toEqual([
      [0, 500],
      [500, 500],
      [1000, 500],
      [1500, 500],
      [-500, 500],
    ])
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

  it('drops no point of a straight diagonal cut to the millimetre its points round to (#538)', () => {
    let trail: CasingTrail = EMPTY_CASING_TRAIL
    const due: { xMm: number; yMm: number }[] = []
    for (let step = 0; step <= 100; step++) {
      const cut = { from: diagonalAt(step - 1), to: diagonalAt(step) }
      const followed = followCasingTrailAlongCut(trail, cut, true)
      trail = followed.trail
      due.push(...followed.due)
    }
    const gaps = due.slice(1).map((point, index) => Math.round(distanceBetween(due[index], point)))
    expect(due.length).toBeGreaterThan(50)
    expect(gaps.every((gap) => gap >= 499 && gap <= 501)).toBe(true)
  })

  it('starts a new cut where the sweep starts past the ring lag of the last point', () => {
    const start = followCasingTrailAlongCut(EMPTY_CASING_TRAIL, cutTo(0, 0), true).trail
    const far = followCasingTrailAlongCut(start, cutTo(9000, 0), true).trail
    expect(far.lastAxisPoint).toEqual({ xMm: 9000, yMm: 0 })
  })
})

/** 300 mm a step down a 7:13 diagonal from the origin, so every point rounds. */
function diagonalAt(step: number) {
  const along = Math.max(0, step) * 300
  return { xMm: Math.floor((along * 13) / 14.765), yMm: -Math.floor((along * 7) / 14.765) }
}

function distanceBetween(a: { xMm: number; yMm: number }, b: { xMm: number; yMm: number }) {
  return Math.sqrt((a.xMm - b.xMm) ** 2 + (a.yMm - b.yMm) ** 2)
}

// Ticket 514: with a pose report every tick while the drill bites, a point is recorded at the first
// report half a metre on, so the trail is denser than at 12-tick reports. Strides are 1.5, 7 and
// 15 m/s at 60 ticks a second.
describe('casing trail at a report every tick (ticket 514)', () => {
  const STRIDES_MM = [25, 117, 250]

  /** Every ring due cutting along x to `toMm`, with the stamp's x when each fell due. */
  function laidAlong(xs: readonly number[], isCutting: boolean, start = EMPTY_CASING_TRAIL) {
    let trail: CasingTrail = start
    const laid: { xMm: number; stampMm: number }[] = []
    let mostWaiting = 0
    for (const x of xs) {
      const step = followCasingTrail(trail, { xMm: x, yMm: 0 }, isCutting)
      trail = step.trail
      laid.push(...step.due.map((point) => ({ xMm: point.xMm, stampMm: x })))
      mostWaiting = Math.max(mostWaiting, trail.unlined.length)
    }
    return { trail, laid, mostWaiting }
  }

  it.each(STRIDES_MM)(
    'charges the axis it cut, and one spacing for the first ring, at %i mm a tick',
    (strideMm) => {
      let trail: CasingTrail = EMPTY_CASING_TRAIL
      let charged = 0
      for (const x of stepsTo(8000, strideMm)) {
        const step = followCasingTrail(trail, { xMm: x, yMm: 0 }, true)
        charged += step.trail.unlined
          .filter((point) => !trail.unlined.includes(point))
          .reduce((sum, point) => sum + point.lengthMm, 0)
        trail = step.trail
      }
      const lastPoint = trail.lastAxisPoint?.xMm ?? 0
      expect(charged).toBe(lastPoint + CASING_RING_SPACING_MM)
    },
  )

  it.each(STRIDES_MM)(
    'keeps a straight cut within six waiting points and lays no ring inside the lag at %i mm a tick',
    (strideMm) => {
      const { laid, mostWaiting } = laidAlong(stepsTo(20000, strideMm), true)
      expect(mostWaiting).toBeLessThan(6)
      expect(laid.every((ring) => ring.stampMm - ring.xMm >= CASING_RING_LAG_MM)).toBe(true)
    },
  )

  it("lays a reversing rig's waiting rings once it has backed 2.15 m past each, never ahead of it", () => {
    const cut = laidAlong(stepsTo(8000, 25), true)
    const backing = stepsTo(8000, 25).reverse()
    const backedOut = laidAlong(backing, false, cut.trail)
    expect(backedOut.trail.unlined).toEqual([])
    expect(backedOut.laid.every((ring) => ring.xMm - ring.stampMm >= CASING_RING_LAG_MM)).toBe(true)
  })
})
