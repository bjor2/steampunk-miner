import { describe, expect, it } from 'vitest'
import { onCurveLevels, type UpgradeLevels } from '../economy/vehicleStats'
import { forcedCoreTrack } from './botCoreRule'

const PLANET = 5
/** Stricter than the 2.5 seconds a tile the bot plays to: the core is still slow at both caps. */
const MIN_TICKS_PER_TILE = 24

function onCurveWithLeads(drillLead: number, tipLead: number): UpgradeLevels {
  const levels = onCurveLevels(PLANET)
  return {
    ...levels,
    drill_power: levels.drill_power + drillLead,
    drill_tip: levels.drill_tip + tipLead,
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

  it('stops buying at both caps while the core is still slow', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 2), PLANET, MIN_TICKS_PER_TILE)).toBeNull()
    expect(forcedCoreTrack(onCurveWithLeads(1, 1), PLANET, MIN_TICKS_PER_TILE)).toBe('drill_tip')
  })
})
