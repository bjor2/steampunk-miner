import { describe, expect, it } from 'vitest'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { sub, toCanonical } from '../../../systems/money'
import { SENSING_ECONOMY } from './sensingEconomy'
import { SENSING_SELLER } from './sensingSales'

// Ticket 248's buy path for the sensing lane, on the loaded slices: the echo sounder and the
// passives sell as one-offs at 15 band-5 units at their unlock planet; the consumables and the
// held rows are not one-off sales.

const ECHO_PLANET = 2

function dockedOnEchoPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: ECHO_PLANET } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e12' } })
  return session
}

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

describe('sensing: the store sells a researched one-off (ticket 248)', () => {
  it('buys the researched echo sounder at 15 band-5 units on planet 2 and owns it', () => {
    const session = dockedOnEchoPlanet()
    session.submit(1, {
      type: 'tech-tree.unlock_node',
      payload: { nodeId: 'tech.sensing.echo_sounder' },
    })
    const before = session.state().players.p1.wallet
    session.submit(2, buyVehicleItemCommand('power.echo_sounder'))
    const price = bandOrePriceAt(SENSING_ECONOMY.price, ECHO_PLANET, ECHO_PLANET)
    expect(ownsItem(session.state(), 'p1', 'power.echo_sounder')).toBe(true)
    expect(walletOf(session)).toBe(toCanonical(sub(before, price)))
  })

  it('offers the echo and the three passives, never a consumable or a held row', () => {
    const offered = [
      'power.echo_sounder',
      'passive.threat_periscope',
      'passive.assay_lens',
      'passive.hazard_barometer',
      'consumable.flare_mortar',
      'consumable.signal_buoy',
      'power.galvanic_probe',
      'power.void_sounder',
    ].filter((itemId) => SENSING_SELLER.offerOf(itemId, 40) !== null)
    expect(offered).toEqual([
      'power.echo_sounder',
      'passive.threat_periscope',
      'passive.assay_lens',
      'passive.hazard_barometer',
    ])
  })
})
