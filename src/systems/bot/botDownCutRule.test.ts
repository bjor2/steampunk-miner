import { describe, expect, it } from 'vitest'
import { PACING_TARGETS } from '../../constants/pacingTargets'
import { onCurveSteps, type UpgradeLevels } from '../economy/vehicleStats'
import { bandDigTicks } from '../vehicle/bandDig'
import { leadCeiling } from './botCoreRule'
import { downCutDrillTrack } from './botDownCutRule'

/** Planet 3 as seed 27182 reached it (ticket 763): planet 1's drill power, planet 2's tip. */
const ARRIVED_ON_PLANET_THREE: UpgradeLevels = {
  ...onCurveSteps(3),
  drill_power: 12,
  drill_tip: 100,
}

/** A fresh rig on planet 1: the tip's on-curve majors alone cut band 5 several times faster. */
const FRESH_ON_PLANET_ONE: UpgradeLevels = { ...onCurveSteps(1), drill_power: 0, drill_tip: 0 }

function withDrillPower(levels: UpgradeLevels, drillPower: number): UpgradeLevels {
  return { ...levels, drill_power: drillPower }
}

describe('bot: the down-cut drill rule (ticket 763)', () => {
  it('finds the on-curve tip leaves band 5 down on planet 3 as slow as the rig arrived', () => {
    const tipped = { ...ARRIVED_ON_PLANET_THREE, drill_tip: onCurveSteps(3).drill_tip }
    expect(bandDigTicks(3, tipped)).toBe(bandDigTicks(3, ARRIVED_ON_PLANET_THREE))
  })

  it('values the drill by band 5 down and buys drill power while the tip leaves it slow', () => {
    const levels = ARRIVED_ON_PLANET_THREE
    expect(downCutDrillTrack(levels, ARRIVED_ON_PLANET_THREE, 3)).toBe('drill_power')
    expect(downCutDrillTrack(withDrillPower(levels, 13), ARRIVED_ON_PLANET_THREE, 3)).toBe(
      'drill_power',
    )
  })

  it('stops once band 5 down is cut in at most 0.7x its arrival time', () => {
    const levels = withDrillPower(ARRIVED_ON_PLANET_THREE, 14)
    const ratio = bandDigTicks(3, levels)! / bandDigTicks(3, ARRIVED_ON_PLANET_THREE)!
    expect(ratio).toBeLessThanOrEqual(PACING_TARGETS.sawtoothDepartureRatioMax)
    expect(downCutDrillTrack(levels, ARRIVED_ON_PLANET_THREE, 3)).toBeNull()
  })

  it('leaves the drill to the other rules where the on-curve tip carries band 5 past the bar', () => {
    expect(downCutDrillTrack(FRESH_ON_PLANET_ONE, FRESH_ON_PLANET_ONE, 1)).toBeNull()
  })

  it('never buys drill power past its lead cap (#86)', () => {
    const capped = withDrillPower(ARRIVED_ON_PLANET_THREE, leadCeiling('drill_power', 3)!)
    expect(downCutDrillTrack(capped, capped, 3)).toBeNull()
  })
})
