import { describe, expect, it } from 'vitest'
import { stepOfMajor, stepsOfMajors } from '../economy/upgradeSteps'
import { onCurveLevels, type UpgradeLevels } from '../economy/vehicleStats'
import { forcedCoreTrack } from './botCoreRule'

const PLANET = 5
/** Stricter than the 2.5 seconds a tile the bot plays to: the core is still slow at both caps. */
const MIN_TICKS_PER_TILE = 24

/** The on-curve steps with the drill tracks `drillLead` and `tipLead` majors ahead. */
function onCurveWithLeads(drillLead: number, tipLead: number): UpgradeLevels {
  const levels = stepsOfMajors(onCurveLevels(PLANET))
  return {
    ...levels,
    drill_power: levels.drill_power + stepOfMajor(drillLead),
    drill_tip: levels.drill_tip + stepOfMajor(tipLead),
  }
}

describe('bot: the forced core rule (#86)', () => {
  it('forces drill power first while the core digs slower than 2.5 seconds a tile', () => {
    expect(forcedCoreTrack(onCurveWithLeads(0, 0), PLANET)).toBe('drill_power')
  })

  it('forces drill_tip instead once drill power is at its cap', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 0), PLANET)).toBe('drill_tip')
  })

  it('forces nothing once the core digs within 2.5 seconds a tile', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 2), PLANET)).toBeNull()
  })

  it('keeps forcing drill power on its pips until the capped major lands', () => {
    expect(
      forcedCoreTrack(
        { ...onCurveWithLeads(1, 0), drill_power: onCurveWithLeads(1, 0).drill_power - 1 },
        PLANET,
      ),
    ).toBe('drill_power')
  })

  it('stops buying at both caps while the core is still slow', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 2), PLANET, MIN_TICKS_PER_TILE)).toBeNull()
    expect(forcedCoreTrack(onCurveWithLeads(1, 1), PLANET, MIN_TICKS_PER_TILE)).toBe('drill_tip')
  })
})
