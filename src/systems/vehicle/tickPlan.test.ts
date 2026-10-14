import { describe, expect, it } from 'vitest'
import { MAX_STEP_MM_PER_TICK } from '../../constants/balance'
import { plannedTickOf, tickPlanOf } from './tickPlan'

// Speed-adaptive substeps (ticket 334): n = ceil(step / 400 mm) up to 4, a kinematic sweep past it.

describe('tick plan (ticket 334)', () => {
  it('steps the world once a tick at the 18 m/s clamp, as before', () => {
    expect(tickPlanOf(0)).toEqual({ kind: 'substeps', count: 1 })
    expect(tickPlanOf(MAX_STEP_MM_PER_TICK)).toEqual({ kind: 'substeps', count: 1 })
  })

  it.each([
    [400, 1],
    [401, 2],
    [800, 2],
    [1200, 3],
    [1600, 4],
  ])('steps a %i mm tick in %i substeps of at most 400 mm', (stepMm, count) => {
    expect(tickPlanOf(stepMm)).toEqual({ kind: 'substeps', count })
  })

  it('sweeps kinematically past four substeps (96 m/s)', () => {
    expect(tickPlanOf(1601)).toEqual({ kind: 'sweep' })
    expect(tickPlanOf(16_000)).toEqual({ kind: 'sweep' })
  })
})

describe('planned tick (ticket 334)', () => {
  const OPEN = { isSolidAt: () => false, position: { x: 0, y: 0 }, boreFacing: null }
  const DT = 1 / 60

  it('keeps the motion rule velocity within the substep budget', () => {
    const planned = plannedTickOf({ x: 0, y: -48 }, DT, OPEN)
    expect(planned).toEqual({ plan: { kind: 'substeps', count: 2 }, velocity: { x: 0, y: -48 } })
  })

  it('carries a body past the budget exactly the swept step, stopped short of ground', () => {
    const wall = { ...OPEN, isSolidAt: (x: number) => x >= 3 }
    const planned = plannedTickOf({ x: 384, y: 0 }, DT, wall)
    expect(planned.plan).toEqual({ kind: 'sweep' })
    expect(planned.velocity.x * DT + 0.45).toBeLessThan(3)
    expect(planned.velocity.x * DT).toBeGreaterThan(2)
  })

  it('follows the bore along the drill facing while the rig cuts', () => {
    const cutting = { ...OPEN, boreFacing: { x: 0, y: -1 } }
    const planned = plannedTickOf({ x: 30, y: -384 }, DT, cutting)
    expect(planned.velocity.x).toBe(0)
    expect(planned.velocity.y).toBeCloseTo(-384, 9)
  })
})
