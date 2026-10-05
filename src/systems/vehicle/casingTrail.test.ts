import { describe, expect, it } from 'vitest'
import { EMPTY_CASING_TRAIL, followCasingTrail, type CasingTrail } from './casingTrail'

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
})
