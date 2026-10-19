import { describe, expect, it } from 'vitest'
import { startLevels, type UpgradeLevels } from '../economy/vehicleStats'
import { cmp, fromSafeInteger } from '../money'
import { ticksPerTile } from '../vehicle/drillRule'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { newMineLayout } from './mineLayout'
import { bestOrePlan, fullTankMeans } from './tripEstimate'

// The bot's planning model priced at real cells a second (ticket 559, #551 B2): a bored tile takes
// its time on the scripted sub-step clock the bot bores on, so a drill purchase that shortens a
// tile by less than a whole tick is planned as the gain it is.

const PARAMS = planetParamsFor(83921, 1)
const LAYOUT = newMineLayout(PARAMS, dockSiteOf(PARAMS))
const BAND_1 = 1

function plannedMoneyAt(levels: UpgradeLevels) {
  const plan = bestOrePlan(LAYOUT, fullTankMeans(levels), BAND_1)
  if (plan === null) throw new Error('planet 1 band 1 should pay')
  return plan.moneyPerTick
}

describe('bot trip estimate (ticket 559)', () => {
  it('plans drill power purchase 1 as a gain though it leaves the whole-tick tile time as it was', () => {
    const fresh = startLevels()
    const once = { ...fresh, drill_power: 1 }
    const wholeTicksOf = (levels: UpgradeLevels) =>
      ticksPerTile(vehicleStatsAt(levels), fromSafeInteger(1))
    expect(wholeTicksOf(once)).toBe(wholeTicksOf(fresh))
    expect(cmp(plannedMoneyAt(once), plannedMoneyAt(fresh))).toBeGreaterThan(0)
  })
})
