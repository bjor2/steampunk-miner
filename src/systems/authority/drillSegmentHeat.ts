/**
 * The rate of a heat settle's drilling segment (spec #113): band plus drill heat less the
 * strongest cooling of the place, in whole units a tick (`heatRules.ts`). With the authority's
 * `heat.workUncapped` on (ticket 541, shape (b): the TD seam 6232743242 priced by Systems
 * 6232736622) a report whose drill ticks of work outnumber the segment's wall ticks pays the drill
 * heat of all of them over the wall ticks; off, the drill heats one drill tick a wall tick and the
 * #113 rule drops the rest.
 */
import type { AuthorityDevFlags } from '../../constants/devFlags'
import { drillHeatPerSecond } from '../economy/heatEconomy'
import { add, fromSafeInteger, mul, sub, type BigStat } from '../money'
import { heatUnitsPerTickOf, heatUnitsPerTickOver } from '../vehicle/vehicleHeat'

export function netUnitsPerTick(heating: BigStat, cooling: BigStat): number {
  return heatUnitsPerTickOf(sub(heating, cooling))
}

/** The drilling segment's rates: the band's heat and the strongest cooling of the place. */
export interface DrillingRates {
  bandHeat: BigStat
  cooling: BigStat
}

/** The drill ticks of work a report did, and the wall ticks the drilling segment runs for. */
export interface DrillWork {
  workTicks: number
  wallTicks: number
}

/**
 * The drilling segment's units a tick: band plus drill heat less the cooling (#113). With
 * `heat.workUncapped` on and more work than wall ticks (ticket 541, the TD seam 6232743242), the
 * drill heat is paid for every tick of work over the wall ticks, `drillHeat × work / wall`, summed
 * and divided once so the integer ratio is exact; band heat and cooling stay per wall tick.
 */
export function drillUnitsPerTickOf(
  planetIndex: number,
  { bandHeat, cooling }: DrillingRates,
  { workTicks, wallTicks }: DrillWork,
  flags: AuthorityDevFlags,
): number {
  const drillHeat = drillHeatPerSecond(planetIndex)
  if (!isWorkPastWall(flags, workTicks, wallTicks)) {
    return netUnitsPerTick(add(bandHeat, drillHeat), cooling)
  }
  const wall = fromSafeInteger(wallTicks)
  const placeHeat = mul(sub(bandHeat, cooling), wall)
  return heatUnitsPerTickOver(add(placeHeat, mul(drillHeat, fromSafeInteger(workTicks))), wallTicks)
}

/** Whether the uncapped rule heats more drill ticks than the segment's wall ticks (ticket 541). */
function isWorkPastWall(flags: AuthorityDevFlags, workTicks: number, wallTicks: number): boolean {
  return flags['heat.workUncapped'] && wallTicks > 0 && workTicks > wallTicks
}
