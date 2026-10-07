import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { liningTypeUnlockPrice } from '../economy/heatEconomy'
import { stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel } from '../economy/vehicleStats'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { isTooHotToDig, liningUnlockFor } from './botHeat'
import { noRouteDeaths } from './botDeathReplay'
import type { BotPlanet } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { boreShaftDownTo } from './botShaft'
import { buyUpgrades } from './botShopping'
import { isLavaRisk } from './botWorld'
import { newMineLayout, shaftColumnAt, shaftTileAt, shaftWaypoints } from './mineLayout'

/** The bot docked at the Upgrade bay of planet `planetIndex` with `money`. */
function botOn(planetIndex: number, money = '1e30'): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: money } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

describe('bot: heat planets (#113)', () => {
  it('wants refractory from planet 8 at its unlock price, and not before', () => {
    expect(liningUnlockFor(botOn(7))).toBeNull()
    expect(liningUnlockFor(botOn(8))).toEqual({
      liningType: 'refractory',
      price: liningTypeUnlockPrice('refractory', 8),
    })
  })

  it('unlocks and selects refractory at the Upgrade bay, and wants it no more', () => {
    const session = botOn(8)
    const params = planetParamsFor(83921, 8)
    const layout = newMineLayout(params, dockSiteOf(params))
    buyUpgrades(session, {
      layout,
      isCoreTheGoal: false,
      gunPolicy: 'never',
      hasMetBlastTile: false,
      restockSize: 1,
      chainPolicy: 'click',
    })
    expect(session.vehicle().lining.active).toBe('refractory')
    expect(liningUnlockFor(session)).toBeNull()
  })

  it('turns home at the pad once the gauge reaches 95', () => {
    const session = botOn(8)
    const planet = planetAt(session, 'pad')
    session.submit({ type: 'debug.setHeat', payload: { heat: 94 } })
    expect(isTooHotToDig(session, planet)).toBe(false)
    session.submit({ type: 'debug.setHeat', payload: { heat: 95 } })
    expect(isTooHotToDig(session, planet)).toBe(true)
  })

  it('turns home deep down earlier, keeping the heat of the climb home in hand', () => {
    const session = botOn(8)
    session.submit({ type: 'debug.setHeat', payload: { heat: 80 } })
    expect(isTooHotToDig(session, planetAt(session, 'pad'))).toBe(false)
    expect(isTooHotToDig(session, planetAt(session, 'deep'))).toBe(true)
  })
})

/** The bot's planet 8 mine with the pilot at the pad or 600 m down the shaft. */
function planetAt(_session: BotSession, where: 'pad' | 'deep'): BotPlanet {
  const params = planetParamsFor(83921, 8)
  const layout = newMineLayout(params, dockSiteOf(params))
  const row = where === 'pad' ? layout.travelRow : layout.travelRow - 600
  return {
    layout,
    pilot: { position: shaftTileAt(layout, row), facing: 0 },
    chargePolicy: 'never',
    hasMetBlastTile: false,
    shellChargeSize: 0,
    hasBeenDestroyedHere: false,
    routeDeaths: noRouteDeaths(),
    gateRouteBlocks: [],
  }
}

describe('bot: shaft round lava (#113)', () => {
  /**
   * On planet 8 column -8 meets lava at rows 351 to 348 (seed 83921): the bot's shaft column until
   * the #175 pad moved it to -10, kept here so the pocket stays the one these cases were made on.
   */
  const POCKET_COLUMN = -8
  const ABOVE_LAVA = 353
  const BELOW_LAVA = 340

  function diggerAbovePocket(): { session: BotSession; planet: BotPlanet } {
    const session = botOn(8)
    for (const upgradeId of UPGRADE_IDS) {
      const level = stepOfMajor(onCurveLevel(upgradeId, 8))
      session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
    }
    // The casing grade the bot buys before planet 8 too: scripted mining lays casing (#115), and a
    // grade short of the band lets the dig's weak blocks collapse on it.
    session.submit({ type: 'debug.setCasingGrade', payload: { grade: 5 } })
    session.submit({ type: 'debug.freezeEnemies', payload: { frozen: true } })
    session.submit({ type: 'undock', payload: {} })
    const params = planetParamsFor(83921, 8)
    const layout = {
      ...newMineLayout(params, dockSiteOf(params)),
      shaftColumn: POCKET_COLUMN,
      shaftBottomRow: ABOVE_LAVA,
    }
    const position = shaftTileAt(layout, ABOVE_LAVA)
    return {
      session,
      planet: {
        layout,
        pilot: { position, facing: 0 },
        chargePolicy: 'never',
        hasMetBlastTile: false,
        shellChargeSize: 0,
        hasBeenDestroyedHere: false,
        routeDeaths: noRouteDeaths(),
        gateRouteBlocks: [],
      },
    }
  }

  it('steps the shaft sideways to a clear column and bores on below the pocket', () => {
    const { session, planet } = diggerAbovePocket()
    expect(isLavaRisk(session.state(), shaftTileAt(planet.layout, 350))).toBe(true)
    expect(boreShaftDownTo(session, planet, BELOW_LAVA)).toBe(true)
    expect(planet.layout.shaftJogs.length).toBeGreaterThan(0)
    expect(planet.layout.shaftBottomRow).toBe(BELOW_LAVA)
  })

  it('steps aside to a column clear past the pocket, so a gallery under the jog cannot trap it', () => {
    // The #130 planet 8 loop: a jog one column over met the same pocket a row lower, and the only
    // row left to step aside from again already had a gallery dug off it.
    const { session, planet } = diggerAbovePocket()
    const dugEast = { east: 20, west: 0, isEastDone: true, isWestDone: true }
    planet.layout.galleries.set(ABOVE_LAVA - 1, dugEast)
    expect(boreShaftDownTo(session, planet, BELOW_LAVA)).toBe(true)
    expect(planet.layout.shaftBottomRow).toBe(BELOW_LAVA)
  })

  it('travels the shaft round each jog, down and back up the same way', () => {
    const params = planetParamsFor(83921, 8)
    const layout = { ...newMineLayout(params, dockSiteOf(params)), shaftColumn: -8 }
    layout.shaftJogs.push({ row: 352, column: -6 }, { row: 300, column: -9 })
    expect(shaftColumnAt(layout, 353)).toBe(-8)
    expect(shaftColumnAt(layout, 352)).toBe(-6)
    expect(shaftColumnAt(layout, 299)).toBe(-9)
    const down = shaftWaypoints(layout, 400, 250)
    expect(down).toEqual([
      { tx: -8, ty: 352 },
      { tx: -6, ty: 352 },
      { tx: -6, ty: 300 },
      { tx: -9, ty: 300 },
      { tx: -9, ty: 250 },
    ])
    expect(shaftWaypoints(layout, 250, 400)).toEqual([
      { tx: -9, ty: 300 },
      { tx: -6, ty: 300 },
      { tx: -6, ty: 352 },
      { tx: -8, ty: 352 },
      { tx: -8, ty: 400 },
    ])
  })

  it('never steps aside along a row it has dug a gallery off', () => {
    const { session, planet } = diggerAbovePocket()
    const dug = { east: 4, west: 0, isEastDone: false, isWestDone: false }
    ;[352, 353, 354].forEach((row) => planet.layout.galleries.set(row, { ...dug }))
    boreShaftDownTo(session, planet, BELOW_LAVA)
    expect(planet.layout.shaftJogs.map((jog) => jog.row)).not.toEqual(
      expect.arrayContaining([352, 353, 354]),
    )
  })

  it('never frees the pocket or touches it on the way', () => {
    const { session, planet } = diggerAbovePocket()
    boreShaftDownTo(session, planet, BELOW_LAVA)
    expect(session.state().lava.loose).toEqual([])
    expect(session.events().filter((event) => event.type === 'LavaTouched')).toEqual([])
  })
})
