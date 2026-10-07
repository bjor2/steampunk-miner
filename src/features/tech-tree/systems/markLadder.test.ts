import { describe, expect, it } from 'vitest'
import { isMasteredAt, lastMarkOf, markStepOf } from './markLadder'
import type { MarkLadder } from './techNode'

// The echo sounder's #162 section 4.2 row; an ore-moving item with a duration; a foam crate whose
// cone meets a terrain cap early.
const INCOME_ITEM: MarkLadder = {
  isIncomeItem: true,
  cooldown: 600,
  magnitude: { base: 600 },
  charges: 2,
}
const ECHO_SOUNDER: MarkLadder = {
  isIncomeItem: false,
  cooldown: 300,
  magnitude: { base: 600 },
  charges: 3,
}
const ASSAY_LENS: MarkLadder = { isIncomeItem: false, magnitude: { base: 12 } }
const STABILISER_FOAM: MarkLadder = {
  isIncomeItem: false,
  magnitude: { base: 16, limit: 20 },
  charges: 4,
}

function steppedStatsUpTo(ladder: MarkLadder, lastMark: number) {
  return Array.from({ length: lastMark - 1 }, (_, index) => markStepOf(ladder, index + 2).stepped)
}

describe('tech tree: Mark ladder', () => {
  it('reads the item as bought at Mark 1, with nothing stepped', () => {
    expect(markStepOf(ECHO_SOUNDER, 1)).toEqual({
      mark: 1,
      stats: { cooldown: 300, magnitude: 600, charges: 3 },
      stepped: null,
      isMastered: false,
    })
  })

  it('steps cooldown, then magnitude, then charges, in rotation', () => {
    expect(steppedStatsUpTo(ECHO_SOUNDER, 7)).toEqual([
      'cooldown',
      'magnitude',
      'charges',
      'cooldown',
      'magnitude',
      'charges',
    ])
  })

  it('shrinks cooldown by the step to whole ticks and stops at the half floor', () => {
    const cooldowns = Array.from(
      { length: 40 },
      (_, index) => markStepOf(ECHO_SOUNDER, index + 1).stats.cooldown,
    )
    expect(cooldowns[3]).toBe(276)
    expect(cooldowns.at(-1)).toBe(150)
    expect(cooldowns.every(Number.isSafeInteger)).toBe(true)
  })

  it('masters an ordinary item after 17 rotating Marks: 9 cooldown, 5 magnitude, 3 charges', () => {
    expect(lastMarkOf(ECHO_SOUNDER)).toBe(18)
    expect(markStepOf(ECHO_SOUNDER, 18)).toEqual({
      mark: 18,
      stats: { cooldown: 150, magnitude: 1200, charges: 6 },
      stepped: expect.any(String),
      isMastered: true,
    })
  })

  it('masters an income item after 11 Marks: a 0.7 cooldown floor and a 1.4 magnitude cap', () => {
    expect(lastMarkOf(INCOME_ITEM)).toBe(12)
    expect(markStepOf(INCOME_ITEM, 12).stats).toEqual({ cooldown: 420, magnitude: 840, charges: 5 })
  })

  it('keeps stepping the other stats once a terrain magnitude reaches its cell cap', () => {
    const steps = steppedStatsUpTo(STABILISER_FOAM, lastMarkOf(STABILISER_FOAM))
    const pastCap = steps.slice(steps.lastIndexOf('magnitude') + 1)
    expect(markStepOf(STABILISER_FOAM, 30).stats.magnitude).toBe(20)
    expect(pastCap.length).toBeGreaterThan(0)
    expect(pastCap.every((stat) => stat === 'charges')).toBe(true)
  })

  it('never grows a terrain magnitude past its cap, however high the Mark', () => {
    const capped: MarkLadder = { isIncomeItem: false, magnitude: { base: 30, limit: 32 } }
    expect(markStepOf(capped, 2).stats.magnitude).toBe(32)
    expect(markStepOf(capped, 100).stats.magnitude).toBe(32)
  })

  it('steps a passive with only a magnitude until it is mastered', () => {
    expect(
      steppedStatsUpTo(ASSAY_LENS, lastMarkOf(ASSAY_LENS)).every((s) => s === 'magnitude'),
    ).toBe(true)
    expect(markStepOf(ASSAY_LENS, lastMarkOf(ASSAY_LENS)).stats.magnitude).toBe(24)
  })

  it('says a Mark past mastery changes nothing and is mastered', () => {
    const last = lastMarkOf(ECHO_SOUNDER)
    expect(isMasteredAt(ECHO_SOUNDER, last - 1)).toBe(false)
    expect(isMasteredAt(ECHO_SOUNDER, last)).toBe(true)
    expect(markStepOf(ECHO_SOUNDER, last + 5).stats).toEqual(markStepOf(ECHO_SOUNDER, last).stats)
  })

  it('changes exactly one stat with every Mark up to mastery', () => {
    for (let mark = 2; mark <= lastMarkOf(ECHO_SOUNDER); mark += 1) {
      const before = markStepOf(ECHO_SOUNDER, mark - 1).stats
      const after = markStepOf(ECHO_SOUNDER, mark).stats
      const changed = Object.keys(after).filter(
        (stat) => after[stat as keyof typeof after] !== before[stat as keyof typeof before],
      )
      expect(changed).toHaveLength(1)
    }
  })

  it('gives the same whole ticks on every run (powInt, never Math.pow)', () => {
    const ladderTicks = () =>
      Array.from({ length: 12 }, (_, index) => markStepOf(INCOME_ITEM, index + 1).stats)
    expect(ladderTicks()).toEqual(ladderTicks())
    expect(ladderTicks().map((stats) => stats.cooldown)).toEqual([
      600, 552, 552, 552, 508, 508, 508, 467, 467, 467, 430, 420,
    ])
  })

  it('masters a ladder with no stats at once', () => {
    expect(lastMarkOf({ isIncomeItem: false })).toBe(1)
  })
})
