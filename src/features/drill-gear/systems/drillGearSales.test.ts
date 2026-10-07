import { describe, expect, it } from 'vitest'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { sub, toCanonical } from '../../../systems/money'
import {
  DRILL_GEAR_ITEMS,
  drillGearItemOf,
  itemPriceOf,
  type DrillGearItem,
} from './drillGearItems'
import { DRILL_GEAR_SELLER } from './drillGearSales'

// Ticket 248's buy path for the drill-gear lane, on the loaded slices: each shipped item sells as
// a one-off at 15 band-5 units at its unlock planet, the price its card shows; the held-back
// twin-bit head and dielectric bit are not sold.

const BIT_PLANET = 4

function dockedOnBitPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: BIT_PLANET } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e12' } })
  return session
}

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

describe('drill-gear: the store sells a researched one-off (ticket 248)', () => {
  it('buys the researched vibratory bit at its card price on planet 4 and owns it', () => {
    const session = dockedOnBitPlanet()
    session.submit(1, {
      type: 'tech-tree.unlock_node',
      payload: { nodeId: 'tech.drill_gear.vibratory_bit' },
    })
    const before = session.state().players.p1.wallet
    session.submit(2, buyVehicleItemCommand('gear.vibratory_bit'))
    const price = itemPriceOf(drillGearItemOf('gear.vibratory_bit') as DrillGearItem)!
    expect(ownsItem(session.state(), 'p1', 'gear.vibratory_bit')).toBe(true)
    expect(walletOf(session)).toBe(toCanonical(sub(before, price)))
  })

  it('offers the six shipped items and never a held-back one', () => {
    const offered = DRILL_GEAR_ITEMS.map((item) => item.itemId).filter(
      (itemId) => DRILL_GEAR_SELLER.offerOf(itemId, 40) !== null,
    )
    expect(offered).toEqual([
      'gear.vibratory_bit',
      'gear.spoil_auger',
      'gear.side_cutters',
      'gear.thaw_crown',
      'gear.sampling_corer',
      'gear.reach_boom',
    ])
  })
})
