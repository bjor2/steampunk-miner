/**
 * The three bore-gun store tracks as a gap closing to a wall (the TD addendum on #310, the GD
 * decision, the Systems follow-up on ticket 322): level L holds `gap(L - 1)` of the recurrence
 *
 *   gap(0) = gap0 (data)      gap(m + 1) = gap(m) - max(1, floor(gap(m) / 10))
 *
 * and each stat is `wall + perGap * gap`, so every level strictly improves it, the wall is reached
 * exactly at gap 0 and never crossed, and a track at its wall leaves the offer list. Integers only.
 *
 * A level is priced as a tree node is (the locked re-pricing on #322): `oreUnits` of band-5 ore
 * through `bandOrePriceAt` with the level's target planet as both the worth and the pace planet,
 * times `samePlanetRatio` when the previous level was priced on the same planet.
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { mul, type Money } from '../../../systems/money'
import {
  GROUND_GUN,
  type EnergyStat,
  type GunTrack,
  type GunTrackId,
  type PenetrationStat,
  type RateStat,
  type TrackStatRule,
} from './groundGunEconomy'

/** The TD's recurrence closes a tenth of the gap (at least 1) each level. */
const GAP_CLOSE_SHARE = 10
const FIRST_LEVEL = 1

export type RateStats = Readonly<Record<RateStat, number>>
export type PenetrationStats = Readonly<Record<PenetrationStat, number>>
export type EnergyStats = Readonly<Record<EnergyStat, number>>

/** The gap level `level` (>= 1) holds: `gap(level - 1)`, 0 once closed. */
export function trackGapAt(gap0: number, level: number): number {
  let gap = gap0
  for (let step = FIRST_LEVEL; step < level && gap > 0; step += 1) gap = closedOnce(gap)
  return gap
}

/** The level at which the gap is 0: the track's last level. */
export function trackWallLevel(gap0: number): number {
  let level = FIRST_LEVEL
  for (let gap = gap0; gap > 0; gap = closedOnce(gap)) level += 1
  return level
}

export function wallLevelOf(trackId: GunTrackId): number {
  return trackWallLevel(GROUND_GUN.tracks[trackId].gap0)
}

/** A track at its wall is never offered again (GD on #310). */
export function isTrackMaxed(trackId: GunTrackId, level: number): boolean {
  return level >= wallLevelOf(trackId)
}

/** `wall + perGap * gap`. */
export function trackStatAt(rule: TrackStatRule, gap: number): number {
  return rule.wall + rule.perGap * gap
}

export function rateStatsAt(level: number): RateStats {
  return statsAt(GROUND_GUN.tracks.rate, level)
}

export function penetrationStatsAt(level: number): PenetrationStats {
  return statsAt(GROUND_GUN.tracks.penetration, level)
}

export function energyStatsAt(level: number): EnergyStats {
  return statsAt(GROUND_GUN.tracks.energy, level)
}

/** The price of level `level` (1 to the wall) of a track; a level past the wall is not for sale. */
export function trackLevelPrice(trackId: GunTrackId, level: number): Money {
  const track = GROUND_GUN.tracks[trackId]
  const planet = targetPlanetOf(track, level)
  const units = isRepeatPlanet(track, level)
    ? mul(track.price.oreUnits, track.price.samePlanetRatio)
    : track.price.oreUnits
  return bandOrePriceAt({ band: track.price.band, oreUnits: units }, planet, planet)
}

/** The planet level `level` is priced on and expected by. */
export function targetPlanetOf(track: GunTrack<string>, level: number): number {
  const planet = track.targetPlanet[level - FIRST_LEVEL]
  if (planet === undefined) throw new RangeError(`no target planet for level ${level}`)
  return planet
}

/** The levels of a track whose target planet is `planetIndex` or earlier: brass pace by its end. */
export function levelsDueBy(trackId: GunTrackId, planetIndex: number): number {
  return GROUND_GUN.tracks[trackId].targetPlanet.filter((planet) => planet <= planetIndex).length
}

function statsAt<Stat extends string>(
  track: GunTrack<Stat>,
  level: number,
): Readonly<Record<Stat, number>> {
  const gap = trackGapAt(track.gap0, level)
  const entries = Object.entries<TrackStatRule>(track.stats)
  return Object.fromEntries(
    entries.map(([name, rule]) => [name, trackStatAt(rule, gap)]),
  ) as Record<Stat, number>
}

function closedOnce(gap: number): number {
  return gap - Math.max(1, Math.floor(gap / GAP_CLOSE_SHARE))
}

function isRepeatPlanet(track: GunTrack<string>, level: number): boolean {
  return level > FIRST_LEVEL && targetPlanetOf(track, level) === targetPlanetOf(track, level - 1)
}
