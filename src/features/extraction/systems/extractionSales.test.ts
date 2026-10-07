import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { toCanonical } from '../../../systems/money'
import { selectUpgradeBayModel, type UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import { MINERAL_DRAIN } from './extractionContent'
import { extractionItemOf, itemPriceOf, type ExtractionItem } from './extractionItems'

// Ticket 248's store on the loaded slices, for this lane: once its node is researched the drain is
// on sale at the Upgrade bay for the price its card shows, and the held siphon is never sold.

const DRAIN_PLANET = MINERAL_DRAIN.node.unlockTier
const SIPHON = extractionItemOf('power.slurry_siphon') as ExtractionItem

/** On the drain's planet, docked at the Upgrade bay with plenty to spend. */
function dockedOnDrainPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: DRAIN_PLANET } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session
}

/** Researches the drain's node after the Fork it hangs on (#161). */
function researchDrain(session: ScriptedSession): void {
  for (const nodeId of [...MINERAL_DRAIN.node.prereqs, MINERAL_DRAIN.node.id]) {
    session.submit(1, { type: 'tech-tree.unlock_node', payload: { nodeId } })
  }
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

function debitOf(events: readonly DomainEvent[]) {
  const bought = events.find((event) => event.type === 'VehicleItemPurchased')
  return bought?.type === 'VehicleItemPurchased' ? bought.price : null
}

describe('extraction: the store sells the researched drain', () => {
  it('buys the researched drain at its card price and owns it', () => {
    const session = dockedOnDrainPlanet()
    researchDrain(session)
    const row = bayOf(session).items.find((item) => item.itemId === MINERAL_DRAIN.itemId)
    const debit = debitOf(session.submit(2, buyVehicleItemCommand(MINERAL_DRAIN.itemId)))
    expect(row?.card.cost?.exact).toBe(debit)
    expect(debit).toBe(toCanonical(itemPriceOf(MINERAL_DRAIN)))
    expect(ownsItem(session.state(), 'p1', MINERAL_DRAIN.itemId)).toBe(true)
  })

  it('refuses the drain before its node is researched, and spends nothing', () => {
    const session = dockedOnDrainPlanet()
    const before = walletOf(session)
    const events = session.submit(2, buyVehicleItemCommand(MINERAL_DRAIN.itemId))
    expect(refusalOf(events)).toBe('not_researched')
    expect(walletOf(session)).toBe(before)
  })

  it('never sells the held siphon, and spends nothing', () => {
    const session = dockedOnDrainPlanet()
    session.submit(0, { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 40 } })
    const before = walletOf(session)
    const events = session.submit(2, buyVehicleItemCommand(SIPHON.itemId))
    expect(refusalOf(events)).toBe('unknown_vehicle_item')
    expect(walletOf(session)).toBe(before)
  })
})
