import { describe, expect, it } from 'vitest'
import { blockHardness } from '../../../systems/economy/oreEconomy'
import { onCurveSteps, startLevels, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { ticksPerTile } from '../../../systems/vehicle/drillRule'
import { GROUND_GUN } from './groundGunEconomy'
import {
  boreShotOnGround,
  gunRecoveryTicks,
  gunTicksPerCell,
  OPEN_GROUND_SHOT,
  rateCardOf,
  type BoreShot,
} from './gunRecovery'
import { levelsDueBy, penetrationStatsAt, rateStatsAt, wallLevelOf } from './gunTracks'

/** The planet's median ground: band 3, dug by the on-curve rig at the planet's end. */
const MEDIAN_BAND = 3
const MEDIAN_PLANETS = [1, 10, 20]
const PACE_PLANETS = [1, 4, 7, 10]
const BANDS = [1, 2, 3, 4, 5]
/**
 * Each next level is at least 1.03x the real shots a minute, 3600 over the integer recovery
 * (the Systems follow-up on #322 section 2): `100 * current >= 103 * next` on the recovery ticks.
 */
const GAIN_PERCENT = 103
const PERCENT = 100

function medianShotAt(planetIndex: number, rangeCells: number): BoreShot {
  const drill = vehicleStatsAt(onCurveSteps(planetIndex))
  const penetration = penetrationStatsAt(levelsDueBy('penetration', planetIndex))
  const ticks = gunTicksPerCell(
    drill,
    penetration.gunFactorPct,
    blockHardness(planetIndex, MEDIAN_BAND),
  )
  return boreShotOnGround(rangeCells, ticks)
}

function recoveryLadder(shot: BoreShot): number[] {
  const levels = Array.from({ length: wallLevelOf('rate') }, (_, index) => index + 1)
  return levels.map((level) => rateCardOf(level, shot).recoveryTicks)
}

function expectEveryLevelGains(recoveries: readonly number[]): void {
  recoveries.slice(1).forEach((next, index) => {
    expect(PERCENT * recoveries[index]).toBeGreaterThanOrEqual(GAIN_PERCENT * next)
  })
}

describe('gun recovery and the rate card', () => {
  it('waits max(cooldown, ceil(spent x 100 / kGunPct)): 90 dig ticks at the wall is 200 ticks', () => {
    expect(gunRecoveryTicks(90, rateStatsAt(wallLevelOf('rate')))).toBe(200)
    expect(gunRecoveryTicks(90, rateStatsAt(1))).toBe(360)
    expect(gunRecoveryTicks(0, rateStatsAt(1))).toBe(45)
    expect(gunRecoveryTicks(10, rateStatsAt(1))).toBe(45)
    expect(gunRecoveryTicks(12, rateStatsAt(1))).toBe(48)
  })

  it('shows floor(3600 / recovery) shots a minute and the cells they open: 55 dig ticks reads 16 at L1 and 29 at the wall', () => {
    const shot: BoreShot = { cells: 1, spentDigTicks: 55, isBlocked: false }
    expect(rateCardOf(1, shot)).toEqual({
      recoveryTicks: 220,
      shotsPerMinute: 16,
      cellsPerMinute: 16,
      isBlocked: false,
    })
    expect(rateCardOf(wallLevelOf('rate'), shot)).toMatchObject({
      recoveryTicks: 123,
      shotsPerMinute: 29,
    })
  })

  it('reads open ground off the cooldown alone: 80 shots a minute at L1, 240 at the wall', () => {
    expect(rateCardOf(1, OPEN_GROUND_SHOT).shotsPerMinute).toBe(80)
    expect(rateCardOf(wallLevelOf('rate'), OPEN_GROUND_SHOT).shotsPerMinute).toBe(240)
  })

  it('bores whole cells within the 90-tick budget up to the range, and none of ground the tip only skids on', () => {
    expect(boreShotOnGround(4, 24)).toEqual({ cells: 3, spentDigTicks: 72, isBlocked: false })
    expect(boreShotOnGround(10, 24)).toEqual({ cells: 3, spentDigTicks: 72, isBlocked: false })
    expect(boreShotOnGround(4, 90)).toEqual({ cells: 1, spentDigTicks: 90, isBlocked: false })
    expect(boreShotOnGround(4, 91)).toEqual({ cells: 0, spentDigTicks: 0, isBlocked: false })
    expect(boreShotOnGround(4, null)).toEqual({ cells: 0, spentDigTicks: 0, isBlocked: true })
    expect(rateCardOf(1, boreShotOnGround(4, null)).isBlocked).toBe(true)
  })

  it('digs at the gun share of drill power with the tip unchanged: half power above the tick floor takes twice the ticks', () => {
    const drill = vehicleStatsAt(startLevels())
    const hardness = blockHardness(1, 1)
    expect(ticksPerTile(drill, hardness)).toBe(40)
    expect(gunTicksPerCell(drill, 100, hardness)).toBe(40)
    expect(gunTicksPerCell(drill, 50, hardness)).toBe(80)
  })

  it.each(MEDIAN_PLANETS)(
    'raises the real fire rate by at least 3% every rate level on planet %i median ground, at the base range and the cap',
    (planetIndex) => {
      for (const range of [GROUND_GUN.bore.boreRangeBase, GROUND_GUN.bore.rangeCap]) {
        const shot = medianShotAt(planetIndex, range)
        expect(shot.cells).toBeGreaterThan(0)
        expectEveryLevelGains(recoveryLadder(shot))
      }
    },
  )

  it('raises the real fire rate by at least 3% every rate level in open ground too', () => {
    expectEveryLevelGains(recoveryLadder(OPEN_GROUND_SHOT))
  })

  it('raises the real fire rate by at least 3% every rate level on any rock the drill can bore, from the 24-tick floor to the whole budget', () => {
    const floor = 24
    for (
      let ticksPerCell = floor;
      ticksPerCell <= GROUND_GUN.bore.shotDigTicks;
      ticksPerCell += 1
    ) {
      expectEveryLevelGains(
        recoveryLadder(boreShotOnGround(GROUND_GUN.bore.rangeCap, ticksPerCell)),
      )
    }
  })

  it('keeps the gun under 0.45x the drill cells a second at every wall, on every band of the pace planets', () => {
    const wall = penetrationStatsAt(wallLevelOf('penetration'))
    for (const planetIndex of PACE_PLANETS) {
      const drill = vehicleStatsAt(onCurveSteps(planetIndex))
      for (const band of BANDS) {
        const hardness = blockHardness(planetIndex, band)
        const drillTicks = ticksPerTile(drill, hardness)
        const gunTicks = gunTicksPerCell(drill, wall.gunFactorPct, hardness)
        expect(gunTicks).toBe(drillTicks)
        if (drillTicks === null) continue
        const shot = boreShotOnGround(GROUND_GUN.bore.rangeCap, gunTicks)
        const card = rateCardOf(wallLevelOf('rate'), shot)
        // gun cells per drill cell: cells * drillTicks / recovery <= 45 / 100
        expect(PERCENT * shot.cells * drillTicks).toBeLessThanOrEqual(45 * card.recoveryTicks)
      }
    }
  })
})
