import { describe, expect, it } from 'vitest'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { sub, toCanonical } from '../../../systems/money'
import { TERRAIN_ECONOMY } from './terrainEconomy'
import { TERRAIN_SELLER } from './terrainSales'

// Ticket 248's buy path for the terrain lane, on the loaded slices: the ore-shifter and the pocket
// lance sell as one-offs at 15 band-5 units at their unlock planet; the consumables and the held
// rows are not one-off sales.

const SHIFTER_PLANET = 6

function dockedOnShifterPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: SHIFTER_PLANET } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e12' } })
  return session
}

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

describe('terrain-tools: the store sells a researched one-off (ticket 248)', () => {
  it('buys the researched ore-shifter at 15 band-5 units on planet 6 and owns it', () => {
    const session = dockedOnShifterPlanet()
    session.submit(1, {
      type: 'tech-tree.unlock_node',
      payload: { nodeId: 'tech.terrain.ore_shifter' },
    })
    const before = session.state().players.p1.wallet
    session.submit(2, buyVehicleItemCommand('power.ore_shifter'))
    const price = bandOrePriceAt(TERRAIN_ECONOMY.oneOffPrice, SHIFTER_PLANET, SHIFTER_PLANET)
    expect(ownsItem(session.state(), 'p1', 'power.ore_shifter')).toBe(true)
    expect(walletOf(session)).toBe(toCanonical(sub(before, price)))
  })

  it('offers the ore-shifter and the pocket lance, never a consumable or a held row', () => {
    const offered = [
      'power.ore_shifter',
      'consumable.seam_splitter',
      'power.pressure_pocket',
      'consumable.lodestone_beacon',
      'consumable.stabiliser_foam',
      'consumable.cryo_binder',
      'consumable.shoring_props',
      'power.strata_press',
    ].filter((itemId) => TERRAIN_SELLER.offerOf(itemId, 40) !== null)
    expect(offered).toEqual(['power.ore_shifter', 'power.pressure_pocket'])
  })
})
