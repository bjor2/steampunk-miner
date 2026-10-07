import { describe, expect, it } from 'vitest'
import { onCurveLevels, vehicleStatsAt, type UpgradeLevels } from '../economy/vehicleStats'
import { cmp } from '../money'
import { planetParamsFor } from '../world/planetParams'
import { blastTradeOf, type BlastTrade } from './blastTrade'
import { stepOfMajor, stepsOfMajors } from '../economy/upgradeSteps'

const WORLD_SEED = 83921
const PLANETS = [7, 8, 9, 10]
const BANDS = [1, 2, 3, 4, 5]
/** From the on-curve drill down to a drill this many levels behind it, where tiles turn slow. */
const DRILL_LEVELS_BEHIND = 12

/** Every band of planets 7 to 10 for every drill from on-curve to well behind it. */
function tradesOfCampaign(): BlastTrade[] {
  return PLANETS.flatMap((planetIndex) => {
    const params = planetParamsFor(WORLD_SEED, planetIndex)
    return drillLevelsBehind(stepsOfMajors(onCurveLevels(planetIndex))).flatMap((levels) =>
      BANDS.flatMap((band) => blastTradeOf(params, vehicleStatsAt(levels), band) ?? []),
    )
  })
}

function drillLevelsBehind(onCurve: UpgradeLevels): UpgradeLevels[] {
  return Array.from({ length: DRILL_LEVELS_BEHIND + 1 }, (_, behind) => ({
    ...onCurve,
    drill_power: Math.max(0, onCurve.drill_power - stepOfMajor(behind)),
    drill_tip: Math.max(0, onCurve.drill_tip - stepOfMajor(behind)),
  }))
}

describe('blast trade (#109 numbers acceptance 3)', () => {
  const trades = tradesOfCampaign()

  it('earns less a minute blasting than drilling wherever a tile takes at most 2x the floor', () => {
    const quick = trades.filter((trade) => trade.floorMultiple <= 2)
    expect(quick.length).toBeGreaterThan(0)
    for (const trade of quick)
      expect(cmp(trade.blastMoneyPerTick, trade.drillMoneyPerTick)).toBe(-1)
  })

  it('reaches the next band faster blasting wherever a tile takes 4x the floor or more', () => {
    const slow = trades.filter((trade) => trade.floorMultiple >= 4)
    expect(slow.length).toBeGreaterThan(0)
    for (const trade of slow) expect(trade.blastAdvanceTicks).toBeLessThan(trade.drillAdvanceTicks)
  })
})
