import { describe, expect, it } from 'vitest'
import { TERRAIN_FRAME_BUDGET_MS, VIEW_HALF_DIAGONAL_MAX_M } from '../../constants/scene'
import {
  chunkBuildsPerFrame,
  chunksAcrossView,
  newChunksPerSecond,
  prefetchLeadSeconds,
  spendFrameBudget,
} from './chunkBuildBudget'

describe('chunk build budget (ticket 336)', () => {
  it('counts three chunks across the view at the 20 m zoom-out', () => {
    expect(chunksAcrossView(VIEW_HALF_DIAGONAL_MAX_M)).toBe(3)
  })

  it('brings a row of three new chunks into view every 32 m', () => {
    expect(newChunksPerSecond(480, VIEW_HALF_DIAGONAL_MAX_M)).toBe(45)
  })

  it('builds one chunk a frame at rest and up to 480 m/s at the 20 m zoom-out', () => {
    expect(chunkBuildsPerFrame(0, VIEW_HALF_DIAGONAL_MAX_M)).toBe(1)
    expect(chunkBuildsPerFrame(120, VIEW_HALF_DIAGONAL_MAX_M)).toBe(1)
    expect(chunkBuildsPerFrame(480, VIEW_HALF_DIAGONAL_MAX_M)).toBe(1)
  })

  it('builds two a frame past 480 m/s and up to 960 m/s', () => {
    expect(chunkBuildsPerFrame(481, VIEW_HALF_DIAGONAL_MAX_M)).toBe(2)
    expect(chunkBuildsPerFrame(960, VIEW_HALF_DIAGONAL_MAX_M)).toBe(2)
  })

  it('never builds more than four a frame however fast the rig goes', () => {
    expect(chunkBuildsPerFrame(1_920, VIEW_HALF_DIAGONAL_MAX_M)).toBe(4)
    expect(chunkBuildsPerFrame(100_000, VIEW_HALF_DIAGONAL_MAX_M)).toBe(4)
  })

  it('leads the drive line by 2 s while the queue drains sooner', () => {
    expect(prefetchLeadSeconds(0, 1)).toBe(2)
    expect(prefetchLeadSeconds(120, 1)).toBe(2)
  })

  it('leads by the queue latency once the queue takes longer than 2 s to drain', () => {
    expect(prefetchLeadSeconds(180, 1)).toBe(3)
    expect(prefetchLeadSeconds(360, 2)).toBe(3)
    expect(prefetchLeadSeconds(361, 2)).toBeCloseTo(181 / 60, 9)
  })
})

describe('frame budget (ticket 336)', () => {
  const runWithCosts = (costs: readonly number[]) => {
    const ran: number[] = []
    const count = spendFrameBudget(
      costs,
      (cost) => {
        ran.push(cost)
        return cost
      },
      TERRAIN_FRAME_BUDGET_MS,
    )
    return { count, ran }
  }

  it('runs nothing when there is no work', () => {
    expect(runWithCosts([]).count).toBe(0)
  })

  it('always runs the first item, even one dearer than the budget', () => {
    expect(runWithCosts([3.5, 0.1]).count).toBe(1)
  })

  it('runs another item only while one as large as the largest so far still fits', () => {
    expect(runWithCosts([0.5, 0.5, 0.5, 0.5, 0.5]).count).toBe(4)
    expect(runWithCosts([1.1, 0.2]).count).toBe(1)
    expect(runWithCosts([0.4, 1.2, 0.1]).count).toBe(2)
  })

  it('runs the items in their order', () => {
    expect(runWithCosts([0.3, 0.2, 0.1]).ran).toEqual([0.3, 0.2, 0.1])
  })
})
