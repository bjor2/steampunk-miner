/**
 * The pacing bot's down-cut drill rule (ticket 763, the Game Director's ruling on #762 and its
 * second addendum): the bot values a drill level by band 5's cut down, the felt time only the drill
 * speeds (#723's drive-bound law), and buys one ahead of the on-curve tip and hull while down cuts
 * still set the leg's pace there. That holds while the tip's on-curve majors, which the on-curve
 * rule buys next, leave band 5's metre down slower than the sawtooth's 0.7x of its arrival time
 * (#81, C3 #86); drill power stays under its lead cap (`botCoreRule.ts`).
 *
 * On planet 3 the tip already cuts band 5 at full efficiency, so its 30 steps (about 27k) moved
 * nothing there and took the one big sale of the planet: two of the three pacing seeds left with no
 * drill purchase and band 5 at 1.00x, on both legs. Where the tip's majors carry band 5 past the
 * bar, as on a fresh planet 1, this rule buys nothing and the on-curve rule leads as before.
 */
import { PACING_TARGETS } from '../../constants/pacingTargets'
import type { UpgradeId } from '../economy/economyDefinition'
import { onCurveStep, type UpgradeLevels } from '../economy/vehicleStats'
import { bandDigTicks } from '../vehicle/bandDig'
import { isUnderLeadCap } from './botCoreRule'

/** Drill power while band 5's cut down is still slow after the on-curve tip; else null. */
export function downCutDrillTrack(
  levels: UpgradeLevels,
  arrival: UpgradeLevels,
  planetIndex: number,
): UpgradeId | null {
  if (!isUnderLeadCap(levels, 'drill_power', planetIndex)) return null
  return isBandFiveDownStillSlow(levels, arrival, planetIndex) ? 'drill_power' : null
}

/**
 * Band 5's metre down with the tip at its on-curve step is slower than the sawtooth's share of its
 * arrival time; false where the tip only skids on band 5, as no drill level digs it then.
 */
function isBandFiveDownStillSlow(
  levels: UpgradeLevels,
  arrival: UpgradeLevels,
  planetIndex: number,
): boolean {
  const arrived = bandDigTicks(planetIndex, arrival)
  const tipped = bandDigTicks(planetIndex, withTipOnCurve(levels, planetIndex))
  if (arrived === null || tipped === null) return false
  return tipped > arrived * PACING_TARGETS.sawtoothDepartureRatioMax
}

/** The levels once the on-curve rule has bought the tip to the planet's on-curve step. */
function withTipOnCurve(levels: UpgradeLevels, planetIndex: number): UpgradeLevels {
  const tip = Math.max(levels.drill_tip, onCurveStep('drill_tip', planetIndex))
  return { ...levels, drill_tip: tip }
}
