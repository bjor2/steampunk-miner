import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../economy/economy'
import {
  AGAINST_LAVA,
  AWAY,
  carveHole,
  crossPocket,
  drillAgainst,
  onHeatPlanet,
  reportAt,
  touchesAtCrossingTick,
} from './lavaFixtures'

// Lava and heat at a pose report every tick while the drill bites (#514 Done-when 7, the GD's,
// Gameplay's and the VS's rulings): every reported pose is checked, so a fast rig no longer steps
// over a pocket between two 12-tick poses; the burn lands on the tick the body touches; the grace
// stays in absolute ticks at every cadence; heat per second while drilling is the same at either
// cadence and any drill level. No lava constant changed. Burns per pocket crossed at 5 to 3600
// m/s are logged, not gated, by the lane `lavaCadence.lane.test.ts`.

const { hitGraceTicks } = ECONOMY.enemies.combat
const HEAT_READ_TICKS = 240

/** The ticks a drill held against lava burnt on, reported every `interval` ticks for `ticks`. */
function standingBurnTicksAt(interval: number, ticks: number): number[] {
  const session = onHeatPlanet()
  session.submit(0, carveHole)
  return drillAgainst(session, AGAINST_LAVA, interval, ticks)
}

function gapsOf(ticks: readonly number[]): number[] {
  return ticks.slice(1).map((tick, index) => tick - ticks[index])
}

/** The gauge after `ticks` of drilling clear of lava, reported every `interval` ticks. */
function heatAfterDrilling(interval: number, drillPower: number): number {
  const session = onHeatPlanet()
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: drillPower },
  })
  session.submit(0, reportAt(AWAY))
  drillAgainst(session, AWAY, interval, HEAT_READ_TICKS)
  return session.vehicle().heat.level
}

describe('lava and heat at a report every tick while drilling (#514)', () => {
  for (const speedMps of [44, 240]) {
    it(`burns once crossing a pocket at ${speedMps} m/s that 12-tick reports step over`, () => {
      expect(crossPocket(speedMps, 1).burnTicks).toHaveLength(1)
      expect(crossPocket(speedMps, 12).burnTicks).toEqual([])
    })
  }

  it('burns on the tick the body first touches the pocket, not at a later report', () => {
    const [burnTick] = crossPocket(44, 1).burnTicks
    expect(touchesAtCrossingTick(44, burnTick - 1)).toBe(false)
    expect(touchesAtCrossingTick(44, burnTick)).toBe(true)
  })

  it('burns a drill held against lava once per hit grace, counted in absolute ticks', () => {
    const burnTicks = standingBurnTicksAt(1, 6 * hitGraceTicks)
    expect(gapsOf(burnTicks).every((gap) => gap === hitGraceTicks)).toBe(true)
    expect(burnTicks).toHaveLength(6)
  })

  // VS 6228847292 item 3, Systems 6228846052: one burn per 20-tick grace in absolute ticks at every
  // cadence; 12-tick reports land each burn on the first report once the grace has run (every 24).
  it('burns a drill held against lava at the first report once its grace has run, at 12 ticks too', () => {
    const graceInReports = Math.ceil(hitGraceTicks / 12) * 12
    const burnTicks = standingBurnTicksAt(12, 6 * graceInReports)
    expect(gapsOf(burnTicks).every((gap) => gap === graceInReports)).toBe(true)
    expect(burnTicks).toHaveLength(6)
  })

  it('heats the same per second drilling at a report every tick as every 12 ticks', () => {
    expect(heatAfterDrilling(1, 1)).toBe(heatAfterDrilling(12, 1))
  })

  it('heats no faster per second with a stronger drill, so heat a metre falls as the drill rises', () => {
    expect(heatAfterDrilling(1, 200)).toBe(heatAfterDrilling(1, 1))
    expect(heatAfterDrilling(1, 1)).toBeGreaterThan(0)
  })
})
