import { describe, expect, it } from 'vitest'
import { MAX_STEP_MM_PER_TICK } from '../../constants/balance'
import { tickPlanOf } from './tickPlan'

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
