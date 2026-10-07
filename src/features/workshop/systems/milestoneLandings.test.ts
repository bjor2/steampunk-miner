import { describe, expect, it } from 'vitest'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { landingOf, ownedSwapsOf, type MilestoneMajor } from './milestoneLandings'

/** A stand-in for the #228 list, so the rule is shown before the data lands. */
const DRILL_MILESTONES: readonly MilestoneMajor[] = [
  { track: 'drill_power', major: 1, partIds: ['t2-drill-head'] },
  { track: 'drill_power', major: 2, partIds: ['t3-drill-head'] },
]

function levelsWithDrillAt(step: number) {
  const levels = createScriptedSession().state().players.p1.vehicle.levels
  return { ...levels, drill_power: step }
}

describe('workshop milestone landings', () => {
  it('lands a pip on every step but the last of a major', () => {
    expect(landingOf('drill_power', 0)).toBe('pip')
    expect(landingOf('drill_power', stepOfMajor(1) - 2)).toBe('pip')
  })

  it('lands every big level-up as an ordinary major while the milestone list is empty', () => {
    expect(landingOf('drill_power', stepOfMajor(1) - 1)).toBe('major')
    expect(landingOf('drill_power', stepOfMajor(2) - 1)).toBe('major')
  })

  it('lands a milestone on a listed major of that track only', () => {
    expect(landingOf('drill_power', stepOfMajor(1) - 1, DRILL_MILESTONES)).toBe('milestone')
    expect(landingOf('drill_power', stepOfMajor(3) - 1, DRILL_MILESTONES)).toBe('major')
    expect(landingOf('engine', stepOfMajor(1) - 1, DRILL_MILESTONES)).toBe('major')
  })

  it("swaps in the parts of the track's highest owned milestone, from the step that lands it", () => {
    expect(ownedSwapsOf(levelsWithDrillAt(stepOfMajor(1) - 1), DRILL_MILESTONES)).toEqual([])
    expect(ownedSwapsOf(levelsWithDrillAt(stepOfMajor(1)), DRILL_MILESTONES)).toEqual([
      { track: 'drill_power', partIds: ['t2-drill-head'] },
    ])
    expect(ownedSwapsOf(levelsWithDrillAt(stepOfMajor(4) + 3), DRILL_MILESTONES)).toEqual([
      { track: 'drill_power', partIds: ['t3-drill-head'] },
    ])
  })

  it('swaps nothing with no milestone list', () => {
    expect(ownedSwapsOf(levelsWithDrillAt(stepOfMajor(6)))).toEqual([])
  })
})
