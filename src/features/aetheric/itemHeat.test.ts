import { describe, expect, it } from 'vitest'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { fromSafeInteger, toCanonical } from '../../systems/money'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { CONDENSER_ID } from './systems/condenserItem'
import { GOVERNOR_ID } from './systems/governorItem'
import { itemHeatReadingOf } from './systems/itemHeatReading'
import { itemHeatUnitsAt } from './systems/itemHeat'
import { WHISTLE_ID } from './systems/whistleItem'

// The off-act item heat gauge (the GD ruling on #263 Q1 a): it holds only the heat items add, cools
// on its own, never passes its max, and shows on the HUD only while the player owns the governor
// or the condenser. Set up through `debug.aetheric.setItemHeat` and the loadout's debug command.

const ITEM_HEAT = AETHERIC_ECONOMY.itemHeat
const SET_TICK = 10
const HEAT = 600

function sessionWithHeat(heat: number, owned: readonly string[] = []): ScriptedSession {
  const session = createScriptedSession()
  session.submit(SET_TICK, setVehicleLoadoutCommand({}, owned))
  session.submit(SET_TICK, { type: 'debug.aetheric.setItemHeat', payload: { heat } })
  return session
}

describe('item heat gauge', () => {
  it('cools by its json rate each tick from the tick it was set, down to cold', () => {
    const session = sessionWithHeat(HEAT)
    const ticks = 25
    expect(itemHeatUnitsAt(session.state(), 'p1', SET_TICK + ticks)).toBe(
      HEAT - ITEM_HEAT.coolingUnitsPerTick * ticks,
    )
    const coldTick = SET_TICK + HEAT / ITEM_HEAT.coolingUnitsPerTick
    expect(itemHeatUnitsAt(session.state(), 'p1', coldTick + 100)).toBe(0)
  })

  it('leaves the save and the digest while the gauge is cold', () => {
    const session = sessionWithHeat(0)
    expect(session.state().players.p1.slices ?? {}).not.toHaveProperty('aetheric.heat')
  })

  it('is hidden while the player owns neither the governor nor the condenser', () => {
    expect(itemHeatReadingOf(sessionWithHeat(HEAT).state(), 'p1')).toBeNull()
    expect(itemHeatReadingOf(sessionWithHeat(HEAT, [WHISTLE_ID]).state(), 'p1')).toBeNull()
  })

  it('reads in percent of its max once the governor or the condenser is owned', () => {
    const quarter = ITEM_HEAT.gaugeMaxUnits / 4
    ;[GOVERNOR_ID, CONDENSER_ID].forEach((itemId) => {
      const session = sessionWithHeat(quarter, [itemId])
      session.advanceTo(SET_TICK)
      expect(itemHeatReadingOf(session.state(), 'p1'), itemId).toMatchObject({
        text: '25%',
        exact: toCanonical(fromSafeInteger(quarter)),
        permille: 250,
      })
    })
  })
})
