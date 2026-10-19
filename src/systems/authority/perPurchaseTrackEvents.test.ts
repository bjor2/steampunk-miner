import { describe, expect, it } from 'vitest'
import { grantMoneyCommand } from '../startScenarioCommands'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from './purchaseChain'
import { createScriptedSession } from './scriptedSession'

// Ticket 553 (HS on #551): hold, boiler and engine purchases stay purely price-gated. They unlock
// nothing, fire no FeatureUnlocked or ore-first event, and are never locked by planet.

const PURCHASES = 40
/** What a track purchase may answer with: the purchase, and the visual tier it crosses (#44). */
const PURCHASE_EVENTS = new Set(['UpgradePurchased', 'VehicleConfigurationChanged'])

function eventTypesOfBuying(upgradeId: string, planetIndex: number): string[] {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, grantMoneyCommand('1e40'))
  session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return Array.from({ length: PURCHASES }, (_, index) =>
    session.submit(2 + index, buyUpgradeCommand(upgradeId, CLICK_CHAIN)),
  ).flatMap((events) => events.map((event) => event.type))
}

describe('hold, boiler and engine purchases (ticket 553)', () => {
  it.each(['cargo_hold', 'boiler', 'engine'])(
    'sells %s on planet 1 for money alone, firing only the purchase and its visual tier',
    (upgradeId) => {
      const types = eventTypesOfBuying(upgradeId, 1)
      expect(types.filter((type) => type === 'UpgradePurchased')).toHaveLength(PURCHASES)
      expect(types.filter((type) => !PURCHASE_EVENTS.has(type))).toEqual([])
    },
  )

  it.each(['cargo_hold', 'boiler', 'engine'])('locks %s on no planet', (upgradeId) => {
    const types = eventTypesOfBuying(upgradeId, 40)
    expect(types.filter((type) => type === 'UpgradePurchased')).toHaveLength(PURCHASES)
  })
})
