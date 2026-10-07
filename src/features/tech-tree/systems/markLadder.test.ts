import { describe, expect, it } from 'vitest'
import { isMasteredAt, lastMarkOf, markStepOf } from './markLadder'
import {
  MILESTONE_MARKS,
  milestoneProblemsOf,
  milestonesOf,
  yieldMilestonesOf,
  type MilestoneClass,
  type MilestoneVerbs,
} from './markMilestones'
import { markBearerOf, markNodeOf } from './markNodes'
import type { MarkLadder, TreeNode } from './techNode'

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

// Milestones (the GD lock on #256), with every pattern's verb authored so the class mapping alone
// decides what each item carries.
const EVERY_VERB: MilestoneVerbs = {
  hold: 'a longer burn',
  secondTap: 'a sideways air-dash',
  siblingLink: {
    verb: 'fires the ballast at half lift',
    siblingId: 'consumable.emergency_ballast',
  },
}
const CLASSES: readonly MilestoneClass[] = [
  'charged',
  'consumable',
  'channel',
  'toggle',
  'always-on',
]

function withMilestonesOf(ladder: MarkLadder, milestoneClass: MilestoneClass): MarkLadder {
  return { ...ladder, milestones: milestonesOf(milestoneClass, EVERY_VERB) }
}

const CAPABILITY: TreeNode = {
  id: 'tech.mobility.steam_boost',
  kind: 'capability',
  lane: 'mobility',
  name: 'Steam boost',
  unlockTier: 2,
  prereqs: [],
  unlocks: { itemId: 'power.steam_boost', mark: 1 },
  iconId: 'power.steam_boost',
  description: 'A burst of steam.',
  label: 'vertical',
  costKind: 'capability',
  depthTerm: 2,
}

describe('tech tree: Mark milestones', () => {
  it('milestones sit only at Marks 3, 6 and 9 and use each pattern at most once', () => {
    const ladders = CLASSES.map((milestoneClass) => withMilestonesOf(ECHO_SOUNDER, milestoneClass))
    for (const ladder of ladders) {
      const patterns = ladder.milestones?.map((milestone) => milestone.pattern) ?? []
      expect(ladder.milestones?.every(({ mark }) => MILESTONE_MARKS.includes(mark))).toBe(true)
      expect(new Set(patterns).size).toBe(patterns.length)
    }
    expect(ladders.flatMap(milestoneProblemsOf)).toEqual([])
  })

  it("an income item's only yield milestone is its sibling-link", () => {
    const yieldPatternsOf = (ladder: MarkLadder) =>
      CLASSES.map((milestoneClass) =>
        yieldMilestonesOf(withMilestonesOf(ladder, milestoneClass)).map((m) => m.pattern),
      )
    expect(yieldPatternsOf(INCOME_ITEM)).toEqual(CLASSES.map(() => ['sibling-link']))
    expect(yieldPatternsOf(ECHO_SOUNDER)).toEqual(CLASSES.map(() => []))
  })

  it('always-on items carry a sibling-link only', () => {
    expect(milestonesOf('always-on', EVERY_VERB)).toEqual([
      { mark: 3, pattern: 'sibling-link', ...EVERY_VERB.siblingLink },
    ])
  })

  it('places each class on the #256 mapping, a channel ending in a number step', () => {
    const shapeOf = (milestoneClass: MilestoneClass) =>
      milestonesOf(milestoneClass, EVERY_VERB).map(({ mark, pattern }) => `${mark} ${pattern}`)
    expect(shapeOf('charged')).toEqual(['3 second-tap', '6 hold', '9 sibling-link'])
    expect(shapeOf('channel')).toEqual(['3 second-tap', '6 sibling-link'])
    expect(shapeOf('toggle')).toEqual(['3 hold', '6 second-tap', '9 sibling-link'])
  })

  it('leaves out a pattern its lane has not authored a verb for yet', () => {
    const patterns = milestonesOf('charged', { hold: 'a longer burn' }).map((m) => m.pattern)
    expect(patterns).toEqual(['hold'])
  })

  it('puts milestone Marks on the existing ladder with no premium step', () => {
    const plain = markBearerOf(CAPABILITY, ECHO_SOUNDER)
    const marked = markBearerOf(CAPABILITY, withMilestonesOf(ECHO_SOUNDER, 'charged'))
    expect(marked.lastMark).toBe(plain.lastMark)
    for (const mark of MILESTONE_MARKS) {
      expect(markNodeOf(marked, mark)).toEqual(markNodeOf(plain, mark))
      expect(markStepOf(marked.ladder, mark)).toEqual(markStepOf(ECHO_SOUNDER, mark))
    }
  })

  it('finds a milestone off Marks 3, 6 and 9, past mastery, repeated or with a wrong sibling', () => {
    const ladder: MarkLadder = {
      ...ASSAY_LENS,
      milestones: [
        { mark: 4, pattern: 'hold', verb: 'a longer burn', siblingId: 'power.steam_boost' },
        { mark: 9, pattern: 'hold', verb: ' ' },
        { mark: 9, pattern: 'sibling-link', verb: 'fires the sounder' },
      ],
    }
    expect(lastMarkOf(ASSAY_LENS)).toBeLessThan(9)
    expect(milestoneProblemsOf(ladder)).toEqual([
      'milestone at Mark 4, not 3, 6 or 9',
      'milestone at Mark 9, past the last Mark',
      'milestone at Mark 9 has no verb',
      'milestone at Mark 9, past the last Mark',
      'milestone at Mark 4 names a sibling but is no sibling-link',
      'milestone at Mark 9 names no sibling',
      'Mark 9 appears more than once',
      'pattern hold appears more than once',
    ])
  })
})
