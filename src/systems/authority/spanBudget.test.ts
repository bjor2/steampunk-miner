import { describe, expect, it } from 'vitest'
import { STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { SWEPT_SPAN_CHUNKS_PER_TICK } from '../../constants/terrainBudget'
import { RADIUS_BASE_TILES, RADIUS_GROWTH_TILES } from '../world/planetTable'
import { FACING } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { createScriptedSession, PARAMS, poseAbove } from './scriptedSession'
import { topCuttingStepMmAt, worstSpanChunksAtStep } from './spanBudget'
import { stepBoundsAt } from './stepBoundRead'

// The swept span's chunks-touched budget (ticket 335): what one tick's span crosses at its worst.

describe('swept span chunk budget (ticket 335)', () => {
  it('counts the four chunks a resting stamp on a chunk corner touches', () => {
    expect(worstSpanChunksAtStep(0)).toBe(4)
  })

  it('crosses more chunks the longer the step', () => {
    const counts = [16_000, 64_000, 256_000].map(worstSpanChunksAtStep)
    counts.slice(1).forEach((count, index) => expect(count).toBeGreaterThan(counts[index]))
  })

  it('keeps the TD figure for P200, about 430 m of bore a tick, inside the budget', () => {
    expect(worstSpanChunksAtStep(430_000)).toBeLessThanOrEqual(SWEPT_SPAN_CHUNKS_PER_TICK)
  })

  // Ticket 558: a drill step never passes the planet's radius, 1,000 m on the largest planet.
  it("keeps a step of the largest planet's radius, the furthest any tick cuts, inside the budget", () => {
    const largestRadiusMm = (RADIUS_BASE_TILES + RADIUS_GROWTH_TILES) * 1000
    expect(worstSpanChunksAtStep(largestRadiusMm + STEP_BOUND_TOLERANCE_MM)).toBeLessThanOrEqual(
      SWEPT_SPAN_CHUNKS_PER_TICK,
    )
  })

  it('reads the rig top cutting step as its bound through band-1 rock', () => {
    const session = createScriptedSession()
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    const y = (surfaceRowOfColumn(20, PARAMS.radiusTiles) + 1) * 1000
    session.submit(0, { type: 'reportPose', payload: { ...payload, x: 20_500, y } })
    expect(topCuttingStepMmAt(session.state(), 'p1')).toBe(
      stepBoundsAt(session.state(), 'p1').cuttingMm,
    )
  })
})
