import { describe, expect, it } from 'vitest'
import { onCurveSteps, startLevels, type UpgradeLevels } from '../economy/vehicleStats'
import { cmp, fromSafeInteger } from '../money'
import { ticksPerTile } from '../vehicle/drillRule'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { dockSiteOf } from '../world/dockSite'
import { freshPlanetParamsFor, planetParamsFor, type PlanetParams } from '../world/planetParams'
import { bandOfRow, galleryRows, markSideDone, newMineLayout, type MineLayout } from './mineLayout'
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

// Ticket 625: the surface layer softens band 1's top rock, never its ore, and makes the way down
// cheap enough that a trip could bore on through the core for the same band's far-side rows.

/** The magnetic pace run whose band 1 trip bored on toward the far side and was crushed. */
const FAR_SIDE_PLANET = 25
const FAR_SIDE_SEED = 27182

describe('bot trip estimate on the surface layer (ticket 625)', () => {
  it('plans no trip to a band once its rows above the core are bored out, though the far side has rows', () => {
    const layout = freshMineOn(freshPlanetParamsFor(FAR_SIDE_SEED, FAR_SIDE_PLANET))
    boreOutBandAboveCore(layout, BAND_1)
    const means = fullTankMeans(onCurveSteps(FAR_SIDE_PLANET))
    expect(bandRowsOf(layout, BAND_1).length).toBeGreaterThan(0)
    expect(bestOrePlan(layout, means, BAND_1)).toBeNull()
  })

  it("plans no band 1 trip where the tip scratches the softened rock but not the band's ore", () => {
    const layout = freshMineOn(freshPlanetParamsFor(83921, 20))
    expect(bestOrePlan(layout, fullTankMeans(startLevels()), BAND_1)).toBeNull()
  })
})

function freshMineOn(params: PlanetParams): MineLayout {
  return newMineLayout(params, dockSiteOf(params))
}

function bandRowsOf(layout: MineLayout, band: number): number[] {
  return galleryRows(layout).filter((row) => bandOfRow(layout, row) === band)
}

/** Marks both sides of every band row between the core and the surface as bored out. */
function boreOutBandAboveCore(layout: MineLayout, band: number): void {
  for (const row of bandRowsOf(layout, band).filter((row) => row > 0)) {
    markSideDone(layout, row, 'east')
    markSideDone(layout, row, 'west')
  }
}
