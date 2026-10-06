/**
 * The pacing bot's forced core rule (#29 Systems & Economy note 3) and the lead caps that bound it
 * (C3 #86, Systems & Economy, confirmed by the Game Director). While the core is the goal and the
 * drill digs it slower than 2.5 seconds a tile, a drill level comes before anything else:
 * `drill_power` up to one level past the planet's on-curve level, then `drill_tip` up to two past
 * its own. With both at their caps the rule is satisfied and the core is dug at whatever rate the
 * vehicle has. Uncapped, the rule bought `drill_power` 3 to 5 levels ahead, so the next planet's
 * band 5 started near the 24-tick cap and the #81 sawtooth (band 5 at departure at most 0.7x
 * arrival) could not show. The tip rises 3 levels a planet on curve, so +2 at departure is -1 on
 * the next arrival, and band 5 is already at full efficiency there: the tip lead does not speed
 * band 5 on arrival. At the caps the core digs at 135 ticks a tile on every planet.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { UpgradeId } from '../economy/economyDefinition'
import { onCurveLevel, type UpgradeLevels } from '../economy/vehicleStats'
import { isCoreDugWithin } from './tripEstimate'

/** #29 Systems & Economy note 3: the core is dug at 0.4 tiles a second (2.5 seconds a tile). */
const FORCED_DRILL_TICKS_PER_TILE = (5 * TICKS_PER_SECOND) / 2

/**
 * Levels past the planet's on-curve level the bot buys, forced or marginal (#86). The tip's cap
 * starts at 2 and steps to 3 only if a seed stalls near the core at 2; never above 3.
 */
const LEAD_CAPS: Partial<Record<UpgradeId, number>> = { drill_power: 1, drill_tip: 2 }

/** The tracks the forced rule buys, in order: the tip once drill power is at its cap. */
const FORCED_CORE_TRACKS: readonly UpgradeId[] = ['drill_power', 'drill_tip']

/** The track the forced rule buys next; null once the core digs fast enough or both are capped. */
export function forcedCoreTrack(
  levels: UpgradeLevels,
  planetIndex: number,
  maxTicksPerTile = FORCED_DRILL_TICKS_PER_TILE,
): UpgradeId | null {
  if (isCoreDugWithin(levels, planetIndex, maxTicksPerTile)) return null
  return FORCED_CORE_TRACKS.find((track) => isUnderLeadCap(levels, track, planetIndex)) ?? null
}

/** A track with no lead cap is always under it. */
export function isUnderLeadCap(
  levels: UpgradeLevels,
  track: UpgradeId,
  planetIndex: number,
): boolean {
  const ceiling = leadCeiling(track, planetIndex)
  return ceiling === null || levels[track] < ceiling
}

/** The highest level the bot buys on this planet, or null for a track with no lead cap. */
export function leadCeiling(track: UpgradeId, planetIndex: number): number | null {
  const lead = LEAD_CAPS[track]
  return lead === undefined ? null : onCurveLevel(track, planetIndex) + lead
}
