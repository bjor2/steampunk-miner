import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { PACING_TARGETS } from '../../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { blockHardness } from '../economy/oreEconomy'
import { stepOfLevel } from '../economy/upgradeSteps'
import {
  onCurveLevel,
  startLevels,
  vehicleStatsAt,
  type UpgradeLevels,
  onCurveSteps,
} from '../economy/vehicleStats'
import { subStepsPerTile } from '../vehicle/drillRule'
import { forcedCoreTrack, leadCeiling } from './botCoreRule'

const PLANET = 5
/**
 * Stricter than the 2.5 seconds a tile the bot plays to: the core is still slow at both caps.
 * Since #552 one drill power purchase past on-curve already digs planet 5's core within 2.5
 * seconds a tile (165 ticks on curve, 133 at the cap), so the tip is reached only under this bar.
 */
const MIN_TICKS_PER_TILE = 24

/**
 * The on-curve steps with the drill tracks `drillLead` and `tipLead` levels ahead, each in its
 * own levels: purchases of drill power (#552), majors of the tip.
 */
function onCurveWithLeads(drillLead: number, tipLead: number): UpgradeLevels {
  const levels = onCurveSteps(PLANET)
  return {
    ...levels,
    drill_power: levels.drill_power + stepOfLevel('drill_power', drillLead),
    drill_tip: levels.drill_tip + stepOfLevel('drill_tip', tipLead),
  }
}

describe('bot: the forced core rule (#86)', () => {
  it('forces drill power first while the core digs slower than 2.5 seconds a tile', () => {
    expect(forcedCoreTrack(onCurveWithLeads(0, 0), PLANET)).toBe('drill_power')
  })

  it('forces drill_tip instead once drill power is at its cap', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 0), PLANET, MIN_TICKS_PER_TILE)).toBe('drill_tip')
  })

  it('forces nothing once the core digs within 2.5 seconds a tile', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 2), PLANET)).toBeNull()
  })

  it('keeps forcing drill power a purchase at a time until the capped purchase lands', () => {
    const belowCurve = {
      ...onCurveWithLeads(0, 0),
      drill_power: onCurveWithLeads(0, 0).drill_power - 3,
    }
    expect(forcedCoreTrack(belowCurve, PLANET, MIN_TICKS_PER_TILE)).toBe('drill_power')
    expect(forcedCoreTrack(onCurveWithLeads(0, 0), PLANET, MIN_TICKS_PER_TILE)).toBe('drill_power')
    expect(forcedCoreTrack(onCurveWithLeads(1, 0), PLANET, MIN_TICKS_PER_TILE)).not.toBe(
      'drill_power',
    )
  })

  it('lets drill power lead one purchase past on-curve on every planet, planet 1 too (#552)', () => {
    expect(leadCeiling('drill_power', 1)).toBe(onCurveLevel('drill_power', 1) + 1)
    expect(leadCeiling('drill_power', 2)).toBe(onCurveLevel('drill_power', 2) + 1)
  })

  it('lets the bot leave planet 1 cutting band 1 at 10 cells a second at its one-purchase lead (ticket 396, #552)', () => {
    const levels = { ...startLevels(), drill_power: leadCeiling('drill_power', 1)! }
    const subSteps = subStepsPerTile(vehicleStatsAt(levels), blockHardness(1, 1))!
    const cellsPerSecond = (DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND) / subSteps
    expect(cellsPerSecond).toBeGreaterThanOrEqual(
      PACING_TARGETS.planet1Drill.departureCellsPerSecondMin,
    )
  })

  it('stops buying at both caps while the core is still slow', () => {
    expect(forcedCoreTrack(onCurveWithLeads(1, 2), PLANET, MIN_TICKS_PER_TILE)).toBeNull()
    expect(forcedCoreTrack(onCurveWithLeads(1, 1), PLANET, MIN_TICKS_PER_TILE)).toBe('drill_tip')
  })
})
