import { describe, expect, it } from 'vitest'
import { createDrillLooks, DRILL_LOOK_STEPS, drillLookStageOf } from './drillLookSteps'

const coloursOf = (purchases: readonly number[]) =>
  purchases.map((n) => createDrillLooks()[drillLookStageOf(n)]?.glows[0].colour ?? null)

describe('drill look steps', () => {
  it('shows no look at purchase 0 and 1, nor anywhere below the first threshold', () => {
    expect(drillLookStageOf(0)).toBe(0)
    expect(drillLookStageOf(1)).toBe(0)
    expect(drillLookStageOf(4)).toBe(0)
    expect(createDrillLooks()[0]).toBeNull()
  })

  it('takes its first step at purchase 5', () => {
    expect(DRILL_LOOK_STEPS[0].fromPurchase).toBe(5)
    expect(drillLookStageOf(5)).toBe(1)
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

  it('still shows distinct looks at purchases 20, 50 and 100, and keeps the last past it', () => {
    const [at20, at50, at100, at1000] = coloursOf([20, 50, 100, 1000])
    expect(new Set([at20, at50, at100]).size).toBe(3)
    expect(at1000).toBe(at100)
  })

  it('glows the bit at least as bright as the step before, never pulsing', () => {
    const glows = DRILL_LOOK_STEPS.map((step) => step.bitGlow)
    glows.slice(1).forEach((glow, at) => expect(glow).toBeGreaterThan(glows[at]))
  })

  it('reads a retuned table the same way', () => {
    const table = [{ fromPurchase: 3, colour: '#000001', bitGlow: 1, headGlow: 0 }]
    expect([2, 3, 99].map((n) => drillLookStageOf(n, table))).toEqual([0, 1, 1])
  })
})
