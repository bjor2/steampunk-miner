import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { oreHardness } from '../../../systems/economy/oreEconomy'
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { ticksPerTile } from '../../../systems/vehicle/drillRule'
import { longBarrelAt } from './boreLadders'
import { GROUND_GUN, GUN_TRACK_IDS } from './groundGunEconomy'
import type { GunLevels } from './gunLevels'
import { boreShotOnGround, gunRecoveryTicks, gunTicksPerCell } from './gunRecovery'
import { penetrationStatsAt, rateStatsAt, wallLevelOf } from './gunTracks'

/**
 * The #310 throughput pins with the lane's long barrel on the gun (ticket 318): the bore reaches up
 * to the 10-cell cap, so a shot may open more cells, and the pins must still hold.
 *
 * - Vertical: over any 60 s window, gun cells a second stay at or under 0.5x the on-curve drill's
 *   at P1, P4, P7 and P10, at Mark 50 and at max. The worst window starts on a shot, so it holds
 *   `ceil(window / recovery)` shots.
 * - Systems (a): over 600 s on ground tiers 1, 5 and 9 (bands 1, 5 and 9 of the GD's text; a
 *   planet has five bands), at track levels 1, 5 and max.
 *
 * On today's dig law the 90-tick shot budget ends a rock shot within the base reach, so the
 * barrel's cells come through open pockets; the pins are written for the #304 law, where they
 * will not.
 */
const VERTICAL_WINDOW_TICKS = 60 * TICKS_PER_SECOND
const SYSTEMS_WINDOW_TICKS = 600 * TICKS_PER_SECOND
const DRILL_PLANETS = [1, 4, 7, 10]
const GROUND_TIERS = [1, 5, 9]
const TRACK_LEVELS = [1, 5, 50, 'max'] as const
/** No barrel, as bought, at the range cap, Mastered, and Mark 50 (past Mastered: no change). */
const LONG_BARREL_MARKS = [0, 1, 6, 11, 50]

function levelsAt(level: (typeof TRACK_LEVELS)[number]): GunLevels {
  const at = (trackId: (typeof GUN_TRACK_IDS)[number]) =>
    level === 'max' ? wallLevelOf(trackId) : Math.min(level, wallLevelOf(trackId))
  return { rate: at('rate'), penetration: at('penetration'), energy: at('energy') }
}

function reachAt(barrelMark: number): number {
  return barrelMark === 0 ? GROUND_GUN.bore.boreRangeBase : longBarrelAt(barrelMark).rangeCells
}

/** Gun cells in the worst window against the drill's ticks per cell, on one ground. */
function windowOf(levels: GunLevels, barrelMark: number, drillPlanet: number, tier: number) {
  const drill = vehicleStatsAt(onCurveSteps(drillPlanet))
  const hardness = oreHardness(tier)
  const gunTicks = gunTicksPerCell(
    drill,
    penetrationStatsAt(levels.penetration).gunFactorPct,
    hardness,
  )
  const shot = boreShotOnGround(reachAt(barrelMark), gunTicks)
  const recovery = gunRecoveryTicks(shot.spentDigTicks, rateStatsAt(levels.rate))
  return {
    cellsIn: (windowTicks: number) => Math.ceil(windowTicks / recovery) * shot.cells,
    drillTicksPerCell: ticksPerTile(drill, hardness),
  }
}

/** Every ground the pin names; a ground the drill cannot cut is one the gun may not open either. */
function isHeldOverWindow(levels: GunLevels, barrelMark: number, windowTicks: number): boolean {
  return DRILL_PLANETS.every((drillPlanet) =>
    GROUND_TIERS.every((tier) => {
      const { cellsIn, drillTicksPerCell } = windowOf(levels, barrelMark, drillPlanet, tier)
      if (drillTicksPerCell === null) return cellsIn(windowTicks) === 0
      // cells / window <= 0.5 / drillTicksPerCell, in whole numbers.
      return 2 * cellsIn(windowTicks) * drillTicksPerCell <= windowTicks
    }),
  )
}

describe('ground-gun: the long barrel never lifts the bore past 0.5x the drill (#310 pins)', () => {
  it.each(LONG_BARREL_MARKS)(
    'holds every 60 s window at P1, P4, P7 and P10 at track levels 1, 5, 50 and max with barrel Mark %i',
    (barrelMark) => {
      for (const level of TRACK_LEVELS) {
        expect(isHeldOverWindow(levelsAt(level), barrelMark, VERTICAL_WINDOW_TICKS)).toBe(true)
      }
    },
  )

  it.each(LONG_BARREL_MARKS)(
    'holds 600 s on ground tiers 1, 5 and 9 at track levels 1, 5 and max with barrel Mark %i',
    (barrelMark) => {
      for (const level of [1, 5, 'max'] as const) {
        expect(isHeldOverWindow(levelsAt(level), barrelMark, SYSTEMS_WINDOW_TICKS)).toBe(true)
      }
    },
  )
})
