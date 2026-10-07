import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { toCanonical } from '../../../systems/money'
import { isSlotOpen } from '../../../systems/vehicle/loadoutState'
import { POWER_UP_CORE_ECONOMY } from './powerUpEconomy'
import { cradlePriceOf } from './cradleSales'

// The cradles at the Upgrade bay (ticket 248, #162 4.1): 20 band-5 units at the planet of the node
// that unlocks them, bought once researched, opening their slot; on the loaded slices, where the
// mobility lane registers the third cradle's node at planet 10 and the terrain lane the fourth's at
// planet 20 (ticket 251).

const THIRD = 'slot.powerup_3'
const FOURTH = 'slot.powerup_4'
const THIRD_PLANET = 10

/** On planet 10, docked at the Upgrade bay, every node through it researched. */
function dockedWithTreeThroughTen(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: THIRD_PLANET } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e15' } })
  session.submit(0, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex: THIRD_PLANET },
  })
  return session
}

function boughtPriceOf(events: readonly DomainEvent[]): string | null {
  const bought = events.find((event) => event.type === 'VehicleItemPurchased')
  return bought?.type === 'VehicleItemPurchased' ? bought.price : null
}

describe('power-up cradles on sale (ticket 248)', () => {
  it('sells the researched third cradle at 20 band-5 units at its node planet', () => {
    const session = dockedWithTreeThroughTen()
    const events = session.submit(1, buyVehicleItemCommand(THIRD))
    const atPlanetTen = bandOrePriceAt(
      POWER_UP_CORE_ECONOMY.cradlePrice,
      THIRD_PLANET,
      THIRD_PLANET,
    )
    expect(boughtPriceOf(events)).toBe(toCanonical(atPlanetTen))
  })

  it('opens power-up slot 3 once bought', () => {
    const session = dockedWithTreeThroughTen()
    session.submit(1, buyVehicleItemCommand(THIRD))
    expect(isSlotOpen(session.state().players.p1.vehicle.loadout, 'powerup.3')).toBe(true)
  })

  it('keeps the fourth cradle off sale until its P20 node is researched, priced at P20', () => {
    const session = dockedWithTreeThroughTen()
    const [refused] = session.submit(1, buyVehicleItemCommand(FOURTH))
    expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'not_researched' })
    const atPlanetTwenty = bandOrePriceAt(POWER_UP_CORE_ECONOMY.cradlePrice, 20, 20)
    expect(cradlePriceOf(FOURTH)).toEqual(atPlanetTwenty)
  })
})
