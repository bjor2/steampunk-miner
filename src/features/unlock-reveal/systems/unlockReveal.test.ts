import { describe, expect, it } from 'vitest'
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import { createScriptedSession, dockInBay } from '../../../systems/authority/scriptedSession'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { buyGunCommand, buyUpgradeCommand } from '../../../systems/platform/platformCommands'
import { contentOf } from '../../../systems/registries/content'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { grantMoneyCommand } from '../../../systems/startScenarioCommands'
import { isNewCapabilityItem, NEW_CAPABILITIES } from '../../../systems/views/newCapability'
import { REVEAL } from './revealData'
import { isRevealPlayingAt, revealOfBatch } from './unlockReveal'

// The unlock reveal (ticket 718): only the first buy of a new capability reveals, as the kernel's
// shared table says, and the reveal runs a fixed number of ticks from the buy's own tick.

function dockedRich() {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e30'))
  dockInBay(session, 2, 'upgrade')
  return session
}

/** A vehicle item bought, as the authority answers `buyVehicleItem` (ticket 248). */
function itemBought(itemId: string, playerId = 'p1'): DomainEvent {
  return { type: 'VehicleItemPurchased', itemId, price: '100', playerId, tick: 40, seq: 3 }
}

describe('unlock reveal: which buys reveal', () => {
  it('reveals the turret’s mount from its tick, for the reveal’s length', () => {
    const events = dockedRich().submit(5, buyGunCommand(CLICK_CHAIN))
    const reveal = revealOfBatch(events, 'p1')
    expect(reveal?.revealed).toMatchObject({ item: { kind: 'module', id: 'guns' }, name: 'Guns' })
    expect(reveal?.startTick).toBe(5)
    expect(reveal?.endTick).toBe(5 + REVEAL.revealTicks)
  })

  it('never reveals a gun level bought after the mount', () => {
    const session = dockedRich()
    session.submit(5, buyGunCommand(CLICK_CHAIN))
    expect(revealOfBatch(session.submit(6, buyGunCommand(CLICK_CHAIN)), 'p1')).toBeNull()
  })

  it('never reveals a track level', () => {
    const events = dockedRich().submit(5, buyUpgradeCommand('drill_power', CLICK_CHAIN))
    expect(events.some((event) => event.type === 'UpgradePurchased')).toBe(true)
    expect(revealOfBatch(events, 'p1')).toBeNull()
  })

  it('reveals a vehicle item by the name its seller gives it', () => {
    const [item] = contentOf('vehicle-item').filter((entry) => vehicleItemOfferOf(entry.id))
    const reveal = revealOfBatch([itemBought(item.id)], 'p1')
    expect(reveal?.revealed.name).toBe(vehicleItemOfferOf(item.id)?.name)
    expect(reveal?.revealed.iconId).toBe(item.iconId)
  })

  it('leaves another player’s buy to that player', () => {
    const [item] = contentOf('vehicle-item')
    expect(revealOfBatch([itemBought(item.id, 'p2')], 'p1')).toBeNull()
  })

  it('plays from its start tick until its end tick', () => {
    const reveal = revealOfBatch(dockedRich().submit(5, buyGunCommand(CLICK_CHAIN)), 'p1')!
    expect(isRevealPlayingAt(reveal, 4)).toBe(false)
    expect(isRevealPlayingAt(reveal, 5)).toBe(true)
    expect(isRevealPlayingAt(reveal, reveal.endTick - 1)).toBe(true)
    expect(isRevealPlayingAt(reveal, reveal.endTick)).toBe(false)
  })
})

describe('unlock reveal: data', () => {
  it('lists only buys of new capabilities, so no stat step can reveal', () => {
    const items = REVEAL.events.flatMap((row) => (row.id === undefined ? [] : [row]))
    expect(items.filter((row) => !isNewCapabilityItem({ kind: row.kind, id: row.id! }))).toEqual([])
    expect(REVEAL.events.map((row) => row.kind)).toContain('vehicle-item')
  })

  it('has a reveal for every capability the shared table names', () => {
    const missing = NEW_CAPABILITIES.items.filter(
      (item) => !REVEAL.items.some((row) => row.kind === item.kind && row.id === item.id),
    )
    expect(missing).toEqual([])
  })
})
