import { describe, expect, it } from 'vitest'
import {
  createTurntableSpin,
  rimPeriodRadiansOf,
  rimShareOf,
  stepTurntableSpin,
  writeBandUvs,
  type TurntableSpin,
} from './turntableSpin'
import { WORKS_IDLE } from './worksIdle'

const PERIOD = rimPeriodRadiansOf()
const IDLE_SPEED = (2 * Math.PI) / WORKS_IDLE.turntable.secondsPerTurn

function spinFor(seconds: number, stepsPerSecond: number, isHeld = false): TurntableSpin {
  const spin = createTurntableSpin()
  for (let step = 0; step < seconds * stepsPerSecond; step++) {
    stepTurntableSpin(spin, isHeld, 1 / stepsPerSecond)
  }
  return spin
}

// The Works' idle turntable (ticket 395): the flat band of the drum, remapped on its cylinder.
describe('works turntable', () => {
  it('eases up to one turn per idle period while nothing stands on it', () => {
    const spin = spinFor(20, 60)
    expect(spin.speed).toBeCloseTo(IDLE_SPEED, 6)
    expect(spin.angle).toBeGreaterThan(0)
  })

  it('takes the same time at 30 and 144 steps/s', () => {
    expect(spinFor(10, 30).angle).toBeCloseTo(spinFor(10, 144).angle, 2)
  })

  it('eases to a stop and holds while a car stands on it', () => {
    const spin = spinFor(20, 60)
    for (let step = 0; step < 20 * 60; step++) stepTurntableSpin(spin, true, 1 / 60)
    const held = spin.angle
    stepTurntableSpin(spin, true, 1 / 60)
    expect(spin.speed).toBeLessThan(1e-6)
    expect(spin.angle).toBeCloseTo(held, 6)
  })

  it('keeps the angle within one turn however long it idles', () => {
    expect(spinFor(600, 30).angle).toBeLessThan(2 * Math.PI)
  })

  it('shows the band as baked before it turns, and again after each whole rim period', () => {
    for (const share of [0, 0.1, 0.5, 0.83, 1]) {
      expect(rimShareOf(share, 0, PERIOD)).toBeCloseTo(share, 9)
      expect(rimShareOf(share, 3 * PERIOD, PERIOD)).toBeCloseTo(share, 9)
    }
  })

  it('carries the rim to the right as it turns: the middle shows what stood left of it', () => {
    expect(rimShareOf(0.5, PERIOD / 3, PERIOD)).toBeLessThan(0.5)
    expect(rimShareOf(0.5, -PERIOD / 3, PERIOD)).toBeCloseTo(
      rimShareOf(0.5, (2 * PERIOD) / 3, PERIOD),
      9,
    )
  })

  it('never samples off the band, even at its left edge where the rim comes round from the back', () => {
    for (let turn = 0; turn < PERIOD; turn += PERIOD / 7) {
      for (const share of [0, 0.001, 0.02, 0.5, 0.999, 1]) {
        const shown = rimShareOf(share, turn, PERIOD)
        expect(shown).toBeGreaterThanOrEqual(0)
        expect(shown).toBeLessThanOrEqual(1)
      }
    }
  })

  it('writes the strips across the part’s atlas rect, top row then bottom, ends on the rect’s edges at rest', () => {
    const columns = 4
    const uvs = new Float32Array(2 * 2 * (columns + 1))
    const rect = [0.1, 0.9, 0.5, 0.7] as const
    writeBandUvs(uvs, columns, rect, 0, PERIOD)
    expect(uvs[0]).toBeCloseTo(0.1, 6)
    expect(uvs[1]).toBeCloseTo(0.7, 6)
    expect(uvs[2 * columns]).toBeCloseTo(0.5, 6)
    expect(uvs[2 * (columns + 1) + 1]).toBeCloseTo(0.9, 6)
    expect(uvs[2 * (columns + 1) + 2 * 2]).toBeCloseTo(0.3, 6)
  })
})
