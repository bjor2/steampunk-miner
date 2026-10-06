/**
 * The sawtooth probe of #81 (C3 #86): how long the drill takes per metre of one band of a planet
 * with a set of track levels, so a run can set the vehicle it arrived with against the one it left
 * with. Tiles are 1 m (#6), so ticks per tile are ticks per metre; a band has one hardness for the
 * whole band (#6 section 2), so every tile of it digs in the same time and this is also its median.
 * The heat throttle (#113) is left out: it is a gauge, not a level.
 */
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt, type UpgradeLevels } from '../economy/vehicleStats'
import { ticksPerTile } from './drillRule'

/**
 * The band #81's sawtooth is judged on (Game Director on #86): band 5, the "home band" right above
 * the core, the rock that feels slow on arrival. Band 1 already digs at the 24-tick cap by then.
 */
export const SAWTOOTH_BAND = 5

/** Drill ticks per metre of the planet's band at these levels, or null when the tip only skids. */
export function bandDigTicks(
  planetIndex: number,
  levels: UpgradeLevels,
  band: number = SAWTOOTH_BAND,
): number | null {
  return ticksPerTile(vehicleStatsAt(levels), blockHardness(planetIndex, band))
}
