import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { cmp, fromCanonical, mul, toCanonical } from '../../../systems/money'
import { GROUND_GUN, GUN_TRACK_IDS, type GunTrackId } from './groundGunEconomy'
import {
  energyStatsAt,
  isTrackMaxed,
  levelsDueBy,
  penetrationStatsAt,
  rateStatsAt,
  targetPlanetOf,
  trackGapAt,
  trackLevelPrice,
  trackWallLevel,
  wallLevelOf,
} from './gunTracks'

const AT_LEAST_THREE_PERCENT = fromCanonical('1.03')

/** Each level's stat, L1 to the wall. */
function statLadder(trackId: GunTrackId, stat: string): number[] {
  const levels = Array.from({ length: wallLevelOf(trackId) }, (_, index) => index + 1)
  return levels.map((level) => statsOf(trackId, level)[stat] ?? NaN)
}

function statsOf(trackId: GunTrackId, level: number): Readonly<Record<string, number>> {
  if (trackId === 'rate') return rateStatsAt(level)
  if (trackId === 'penetration') return penetrationStatsAt(level)
  return energyStatsAt(level)
}

/** `next / previous` for a stat that grows, `previous / next` for one that shrinks. */
function gainsOf(ladder: readonly number[], grows: boolean): number[] {
  return ladder.slice(1).map((next, index) => {
    const previous = ladder[index]
    return grows ? next / previous : previous / next
  })
}

describe('gun store tracks', () => {
  it('closes the gap by a tenth, at least 1, each level: 17 takes 17 levels to reach 0', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((level) => trackGapAt(17, level))).toEqual([
      17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6,
    ])
    expect(trackGapAt(100, 2)).toBe(90)
    expect(trackGapAt(17, 18)).toBe(0)
    expect(trackGapAt(17, 40)).toBe(0)
    expect(trackWallLevel(17)).toBe(18)
  })

  it('has 11 rate, 18 penetration and 15 energy levels, the last at the wall', () => {
    expect(wallLevelOf('rate')).toBe(11)
    expect(wallLevelOf('penetration')).toBe(18)
    expect(wallLevelOf('energy')).toBe(15)
    expect(isTrackMaxed('rate', 10)).toBe(false)
    expect(isTrackMaxed('rate', 11)).toBe(true)
  })

  it('runs the rate track from kGunPct 25 and 45 ticks at L1 to 45 and the 15-tick floor at the wall', () => {
    expect(rateStatsAt(1)).toEqual({ kGunPct: 25, cooldownTicks: 45 })
    expect(rateStatsAt(6)).toEqual({ kGunPct: 35, cooldownTicks: 30 })
    expect(rateStatsAt(11)).toEqual({ kGunPct: 45, cooldownTicks: 15 })
  })

  it('runs penetration from 49% of drill power to 100%, and energy from 198% of the dig energy down to 100%', () => {
    expect(penetrationStatsAt(1)).toEqual({ gunFactorPct: 49 })
    expect(penetrationStatsAt(18)).toEqual({ gunFactorPct: 100 })
    expect(energyStatsAt(1)).toEqual({ energyPerCellPct: 198 })
    expect(energyStatsAt(15)).toEqual({ energyPerCellPct: 100 })
  })

  it('improves every stat by at least 3% a level and never crosses its wall', () => {
    const ladders = [
      { ladder: statLadder('rate', 'kGunPct'), grows: true, wall: 45 },
      { ladder: statLadder('rate', 'cooldownTicks'), grows: false, wall: 15 },
      { ladder: statLadder('penetration', 'gunFactorPct'), grows: true, wall: 100 },
      { ladder: statLadder('energy', 'energyPerCellPct'), grows: false, wall: 100 },
    ]
    for (const { ladder, grows, wall } of ladders) {
      for (const gain of gainsOf(ladder, grows)) {
        expect(cmp(fromCanonical(gain.toFixed(6)), AT_LEAST_THREE_PERCENT)).toBeGreaterThanOrEqual(
          0,
        )
      }
      const last = ladder[ladder.length - 1]
      expect(last).toBe(wall)
      expect(ladder.every((value) => (grows ? value <= wall : value >= wall))).toBe(true)
    }
  })

  it('holds a level past the wall at the wall', () => {
    expect(rateStatsAt(30)).toEqual(rateStatsAt(11))
    expect(penetrationStatsAt(50)).toEqual(penetrationStatsAt(18))
    expect(energyStatsAt(50)).toEqual(energyStatsAt(15))
  })

  it('targets one planet per level, never earlier than the level before, ending at P11, P10 and P10', () => {
    for (const trackId of GUN_TRACK_IDS) {
      const { targetPlanet } = GROUND_GUN.tracks[trackId]
      expect(targetPlanet).toHaveLength(wallLevelOf(trackId))
      expect([...targetPlanet].sort((a, b) => a - b)).toEqual(targetPlanet)
      expect(targetPlanet[0]).toBe(1)
    }
    expect(targetPlanetOf(GROUND_GUN.tracks.rate, 11)).toBe(11)
    expect(targetPlanetOf(GROUND_GUN.tracks.penetration, 18)).toBe(10)
    expect(targetPlanetOf(GROUND_GUN.tracks.energy, 15)).toBe(10)
  })

  it('sells at most two levels of a track on one planet, and rate one a planet', () => {
    for (const trackId of GUN_TRACK_IDS) {
      const perPlanet = new Map<number, number>()
      for (const planet of GROUND_GUN.tracks[trackId].targetPlanet) {
        perPlanet.set(planet, (perPlanet.get(planet) ?? 0) + 1)
      }
      expect(Math.max(...perPlanet.values())).toBe(trackId === 'rate' ? 1 : 2)
    }
  })

  it('keeps every track short of its wall before planet 10: brass pace has 3 to 5 gun levels due a planet', () => {
    for (const trackId of GUN_TRACK_IDS) {
      expect(levelsDueBy(trackId, 9)).toBeLessThan(wallLevelOf(trackId))
    }
    expect(levelsDueBy('rate', 11)).toBe(11)
    expect(levelsDueBy('penetration', 10)).toBe(18)
    expect(levelsDueBy('energy', 10)).toBe(15)
    expect(levelsDueBy('rate', 1) + levelsDueBy('penetration', 1) + levelsDueBy('energy', 1)).toBe(
      5,
    )
    expect(levelsDueBy('rate', 2) + levelsDueBy('penetration', 2) + levelsDueBy('energy', 2)).toBe(
      10,
    )
  })

  it('prices L1 as one band-5 ore unit of planet 1, under one drill pip, and a repeat planet at x1.225 of its first', () => {
    const unit = { band: 5, oreUnits: fromCanonical('1') }
    expect(toCanonical(trackLevelPrice('rate', 1))).toBe(toCanonical(bandOrePriceAt(unit, 1, 1)))
    expect(trackLevelPrice('rate', 1)).toEqual(fromCanonical('50.625'))
    expect(toCanonical(trackLevelPrice('penetration', 2))).toBe(
      toCanonical(
        bandOrePriceAt({ band: 5, oreUnits: mul(unit.oreUnits, fromCanonical('1.225')) }, 1, 1),
      ),
    )
    expect(toCanonical(trackLevelPrice('penetration', 3))).toBe(
      toCanonical(bandOrePriceAt(unit, 2, 2)),
    )
    expect(toCanonical(trackLevelPrice('rate', 11))).toBe(toCanonical(bandOrePriceAt(unit, 11, 11)))
  })

  it('refuses a level past the wall: there is nothing to sell', () => {
    expect(() => trackLevelPrice('rate', 12)).toThrow(RangeError)
  })
})
