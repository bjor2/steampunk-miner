/**
 * The sawtooth probe of #81 (C3 #86): how long the drill takes per metre of a planet's first band
 * with a set of track levels, so a run can set the vehicle it arrived with against the one it left
 * with. Tiles are 1 m (#6), so ticks per tile are ticks per metre; band 1 has one hardness for the
 * whole band (#6 section 2), so every tile of it digs in the same time and this is also its median.
 * The heat throttle (#113) is left out: it is a gauge, not a level.
 */
import { blockHardness } from '../economy/oreEconomy'
import { vehicleStatsAt, type UpgradeLevels } from '../economy/vehicleStats'
import { ticksPerTile } from './drillRule'

const FIRST_BAND = 1

/** Drill ticks per metre of the planet's band 1 at these levels, or null when the tip only skids. */
export function firstBandDigTicks(planetIndex: number, levels: UpgradeLevels): number | null {
  return ticksPerTile(vehicleStatsAt(levels), blockHardness(planetIndex, FIRST_BAND))
}
