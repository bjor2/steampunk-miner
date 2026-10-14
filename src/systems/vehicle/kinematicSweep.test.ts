import { describe, expect, it } from 'vitest'
import { boreFollowStepOf, sweptStepOf, type IsSolidAt } from './kinematicSweep'

// The kinematic grid sweep (ticket 334): past the substep budget the body's leading face is walked
// a sample at a time against the ground, with no contact solve.

/** Solid ground everywhere x >= `wallX`. */
const wallAt =
  (wallX: number): IsSolidAt =>
  (x) =>
    x >= wallX

/** A one-sample rib: solid only for `from <= x < from + 0.25`, at any height. */
const ribAt =
  (from: number): IsSolidAt =>
  (x) =>
    x >= from && x < from + 0.25

const OPEN: IsSolidAt = () => false

describe('kinematic sweep (ticket 334)', () => {
  it('takes the whole step through open space', () => {
    expect(sweptStepOf(OPEN, { x: 0, y: 0 }, { x: 6.4, y: -3 })).toEqual({ x: 6.4, y: -3 })
  })

  it('stops the body short of a wall, its face never inside it', () => {
    const step = sweptStepOf(wallAt(10), { x: 0, y: 0 }, { x: 16, y: 0 })
    expect(step.y).toBe(0)
    expect(step.x + 0.45).toBeLessThan(10)
    expect(step.x + 0.45).toBeGreaterThanOrEqual(10 - 0.25)
  })

  it('never passes a rib one sample thick, at any speed', () => {
    for (const stepM of [1.7, 6.4, 16.7, 64]) {
      for (let phase = 0; phase < 12; phase++) {
        const from = { x: (phase / 12) * 0.25, y: 0 }
        const step = sweptStepOf(ribAt(20), from, { x: stepM, y: 0 })
        expect(from.x + step.x + 0.45).toBeLessThan(20.25)
      }
    }
  })

  it('stops a body resting against ground where it stands', () => {
    expect(sweptStepOf(wallAt(0.5), { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('slides along a floor it rests on', () => {
    const floor: IsSolidAt = (_x, y) => y < -0.45
    expect(sweptStepOf(floor, { x: 0, y: 0 }, { x: 5, y: 0 })).toEqual({ x: 5, y: 0 })
  })

  it('keeps only the part along the drill facing in the cut, never backwards', () => {
    expect(boreFollowStepOf({ x: 0.3, y: -4 }, { x: 0, y: -1 })).toEqual({ x: 0, y: -4 })
    const backwards = boreFollowStepOf({ x: 0, y: 2 }, { x: 0, y: -1 })
    expect(Math.hypot(backwards.x, backwards.y)).toBe(0)
  })
})
