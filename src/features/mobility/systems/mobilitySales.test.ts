import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { toCanonical } from '../../../systems/money'
import { selectUpgradeBayModel, type UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import { MOBILITY_ITEM } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { statPreview } from './statPreview'

// Ticket 248 acceptance 1 and the Systems line on it, on the loaded slices: a scenario researches
// the grapple winch's node, the Upgrade bay shows its card, and the buy debits exactly the card's
// price, `bandOrePriceAt` of 15 band-5 units at the node's planet, and makes the item owned.

const GRAPPLE_PLANET = 3
const GRAPPLE_NODE = 'tech.mobility.grapple_winch'
/** A #162 row no slice registers on main: the void sounder waits for the hollow planets (#203). */
const VISION_ROW = 'power.void_sounder'

/** On the grapple's planet, docked at the Upgrade bay with plenty to spend. */
function dockedOnGrapplePlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: GRAPPLE_PLANET } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e12' } })
  return session
}

function research(session: ScriptedSession, nodeId: string): void {
  session.submit(1, { type: 'tech-tree.unlock_node', payload: { nodeId } })
}

function bayOf(session: ScriptedSession): UpgradeBayModel {
  return selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
}

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

function refusalOf(events: readonly DomainEvent[]) {
  const refused = events.find((event) => event.type === 'CommandRejected')
  return refused?.type === 'CommandRejected' ? refused.reason : null
}

const oneOffPriceAtGrapplePlanet = () =>
  toCanonical(bandOrePriceAt(MOBILITY_ECONOMY.prices.oneOff, GRAPPLE_PLANET, GRAPPLE_PLANET))

describe('mobility: the store sells a researched one-off (ticket 248)', () => {
  it('buys the researched grapple at its card price and owns it', () => {
    const session = dockedOnGrapplePlanet()
    research(session, GRAPPLE_NODE)
    const [row] = bayOf(session).items
    expect(row.itemId).toBe(MOBILITY_ITEM.grappleWinch)
    const before = walletOf(session)
    const events = session.submit(2, buyVehicleItemCommand(MOBILITY_ITEM.grappleWinch))
    const bought = events.find((event) => event.type === 'VehicleItemPurchased')
    const debit = bought?.type === 'VehicleItemPurchased' ? bought.price : null
    expect(row.card.cost?.exact).toBe(debit)
    expect(debit).toBe(oneOffPriceAtGrapplePlanet())
    expect(walletOf(session)).not.toBe(before)
    expect(ownsItem(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(true)
  })

  it("shows on the card's price line the number the store debits", () => {
    const [priceLine] = statPreview(MOBILITY_ITEM.grappleWinch, 1, GRAPPLE_PLANET).slice(-1)
    expect(toCanonical(priceLine.value)).toBe(oneOffPriceAtGrapplePlanet())
  })

  it('refuses the grapple before its node is researched, and spends nothing', () => {
    const session = dockedOnGrapplePlanet()
    const before = walletOf(session)
    const events = session.submit(2, buyVehicleItemCommand(MOBILITY_ITEM.grappleWinch))
    expect(refusalOf(events)).toBe('not_researched')
    expect(walletOf(session)).toBe(before)
    expect(bayOf(session).items).toEqual([])
  })

  it('refuses an invisible vision row, and spends nothing', () => {
    const session = dockedOnGrapplePlanet()
    const before = walletOf(session)
    expect(refusalOf(session.submit(2, buyVehicleItemCommand(VISION_ROW)))).toBe(
      'unknown_vehicle_item',
    )
    expect(walletOf(session)).toBe(before)
  })

  it('leaves a researched consumable to the restock: not on sale as a one-off', () => {
    const session = dockedOnGrapplePlanet()
    session.submit(0, { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 5 } })
    const ballast = buyVehicleItemCommand(MOBILITY_ITEM.emergencyBallast)
    expect(refusalOf(session.submit(2, ballast))).toBe('not_for_sale')
  })
})
