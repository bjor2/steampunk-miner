import { describe, expect, it } from 'vitest'
import { rigLookOf } from '../../../rig-look'
import { DRILL_LOOK_STEPS, drillLookStageOf } from './drillLookSteps'

// The colour the rig look paints for drill_power (ticket 577 moved the painting there).
const coloursOf = (purchases: readonly number[]) =>
  purchases.map((n) => rigLookOf('drill_power', n)?.tint ?? null)

describe('drill look steps', () => {
  it('shows no look at purchase 0 and 1, nor anywhere below the first threshold', () => {
    expect(drillLookStageOf(0)).toBe(0)
    expect(drillLookStageOf(1)).toBe(0)
    expect(drillLookStageOf(5)).toBe(0)
    expect(coloursOf([0])).toEqual([null])
  })

  it('takes its first step at purchase 6, its band edge since ticket 809', () => {
    expect(DRILL_LOOK_STEPS[0].fromPurchase).toBe(6)
    expect(drillLookStageOf(6)).toBe(1)
  })

  it('steps exactly on each threshold and holds until the next', () => {
    DRILL_LOOK_STEPS.forEach((step, at) => {
      expect(drillLookStageOf(step.fromPurchase - 1)).toBe(at)
      expect(drillLookStageOf(step.fromPurchase)).toBe(at + 1)
    })
  })

  it('lists its thresholds rising, each with its own colour', () => {
    const froms = DRILL_LOOK_STEPS.map((step) => step.fromPurchase)
    expect(froms).toEqual([...froms].sort((a, b) => a - b))
    expect(new Set(froms).size).toBe(froms.length)
    expect(new Set(DRILL_LOOK_STEPS.map((step) => step.colour)).size).toBe(froms.length)
  })

  it('shows at least three distinct looks across purchases 1 to 20', () => {
    const range = Array.from({ length: 20 }, (_, at) => at + 1)
    expect(new Set(coloursOf(range).filter((colour) => colour !== null)).size).toBeGreaterThan(2)
  })

  it('still shows distinct looks at purchases 20, 40 and 54, and a new finish band past it', () => {
    const [at20, at40, at54, at60, at1000] = coloursOf([20, 40, 54, 60, 1000])
    expect(new Set([at20, at40, at54]).size).toBe(3)
    expect(at60).not.toBe(at54)
    expect(at1000).not.toBeNull()
  })

  it('glows the bit at least as bright as the step before, never pulsing', () => {
    const glows = DRILL_LOOK_STEPS.map((step) => step.bitGlow)
    glows.slice(1).forEach((glow, at) => expect(glow).toBeGreaterThan(glows[at]))
  })

  it('reads a retuned table the same way', () => {
    const table = [{ fromPurchase: 6, colour: '#000001', bitGlow: 1, headGlow: 0 }]
    expect([5, 6, 99].map((n) => drillLookStageOf(n, table))).toEqual([0, 1, 1])
  })
})
