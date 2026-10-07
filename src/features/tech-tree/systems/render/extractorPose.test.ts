import { describe, expect, it } from 'vitest'
import { deployFractionOf, isMovingPart, partPoseAt } from './extractorPose'
import { DEPLOY_TIMING, type GearPart } from './techGear'

const PRONGS: GearPart = {
  id: 'fork-prongs',
  folded: { turn: 0, shift: [-0.11, 0] },
  deployed: { turn: 0, shift: [0, 0] },
}

const HOOD: GearPart = {
  id: 'hood-shell',
  folded: { turn: 1.2, shift: [0, 0] },
  deployed: { turn: 0, shift: [0, 0] },
}

function working(ticksSinceChange: number) {
  return { isWorking: true, ticksSinceChange }
}

function idle(ticksSinceChange: number) {
  return { isWorking: false, ticksSinceChange }
}

describe('extractor pose: the fold-flat rule', () => {
  it('keeps an extractor that has not worked since the save began folded flat', () => {
    expect(deployFractionOf(null)).toBe(0)
  })

  it('deploys within 8 ticks of working a matching gated cell (G&V acceptance)', () => {
    expect(DEPLOY_TIMING.unfoldTicks).toBeLessThanOrEqual(8)
    expect(deployFractionOf(working(0))).toBe(0)
    expect(deployFractionOf(working(DEPLOY_TIMING.unfoldTicks / 2))).toBeCloseTo(0.5)
    expect(deployFractionOf(working(DEPLOY_TIMING.unfoldTicks))).toBe(1)
    expect(deployFractionOf(working(1000))).toBe(1)
  })

  it('stays deployed for 30 ticks after the cell is left, then folds back', () => {
    expect(DEPLOY_TIMING.holdTicks).toBe(30)
    expect(deployFractionOf(idle(0))).toBe(1)
    expect(deployFractionOf(idle(DEPLOY_TIMING.holdTicks))).toBe(1)
    const folding = deployFractionOf(idle(DEPLOY_TIMING.holdTicks + DEPLOY_TIMING.foldTicks / 2))
    expect(folding).toBeCloseTo(0.5)
    expect(deployFractionOf(idle(DEPLOY_TIMING.holdTicks + DEPLOY_TIMING.foldTicks))).toBe(0)
    expect(deployFractionOf(idle(1000))).toBe(0)
  })

  it('poses a moving part at its folded pose at 0, its deployed pose at 1 and between on the way', () => {
    expect(partPoseAt(PRONGS, 0)).toEqual({ turn: 0, shift: [-0.11, 0] })
    expect(partPoseAt(PRONGS, 1)).toEqual({ turn: 0, shift: [0, 0] })
    expect(partPoseAt(PRONGS, 0.5).shift[0]).toBeCloseTo(-0.055)
    expect(partPoseAt(HOOD, 0.5).turn).toBeCloseTo(0.6)
    expect(partPoseAt(HOOD, 0.25).turn).toBeGreaterThan(partPoseAt(HOOD, 0.75).turn)
  })

  it('clamps a fraction outside 0 to 1 to the end poses', () => {
    expect(partPoseAt(HOOD, -1)).toEqual(partPoseAt(HOOD, 0))
    expect(partPoseAt(HOOD, 2)).toEqual(partPoseAt(HOOD, 1))
  })

  it('keeps a part with no poses at rest whatever the fraction', () => {
    const yoke: GearPart = { id: 'fork-yoke' }
    expect(isMovingPart(yoke)).toBe(false)
    expect(isMovingPart(PRONGS)).toBe(true)
    expect(partPoseAt(yoke, 0.7)).toEqual({ turn: 0, shift: [0, 0] })
  })
})
