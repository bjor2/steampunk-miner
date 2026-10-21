import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { formatPrice } from '../../../systems/displayAmount'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromSafeInteger, mul, toCanonical } from '../../../systems/money'
import { describeItem } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { bayEntryRowsOf } from '../../../systems/views/bayEntryRows'
import { restockConsumableIntent } from '../../power-up-core'
import { foamChargesOf, foamStartingCount } from './foamResearch'
import { foamRestockPriceAt } from './foamRestock'
import { STABILISER_FOAM_ID } from './stabiliserFoam'
import { TERRAIN_ECONOMY } from './terrainEconomy'
import { itemPriceOf, terrainItemOf } from './terrainItems'

// Stabiliser foam, the first consumable restocked (ticket 394, X2; the GD ruling on #381, option
// c): a player who researched foam's terrain tier-3 node buys its stack back at the Upgrade bay,
// each charge at foam's band (2 band-5 units, #162 4.1) on the planet it is restocked on; per
// player, deterministic, and closed to a player who does not own foam. Its card's Charges line
// reads the charges left and that price.

const FOAM_NODE = 'tech.terrain.stabiliser_foam'
const FOAM_PLANET = 3
const SETUP_TICK = 0
const RESTOCK_TICK = 1

type PlayerSetup = 'researcher' | 'stranger'

/** On `planet` at the Upgrade bay with money; a researcher has researched foam's node. */
function atUpgradeBay(
  players: Readonly<Record<string, PlayerSetup>>,
  planet = FOAM_PLANET,
): ScriptedSession {
  const session = createScriptedSession(Object.keys(players))
  session.submit(SETUP_TICK, { type: 'debug.setPlanet', payload: { planetIndex: planet } })
  for (const [playerId, setup] of Object.entries(players)) {
    session.submit(SETUP_TICK, { type: 'debug.setMoney', payload: { amount: '1e30' } }, playerId)
    if (setup === 'researcher') researchFoam(session, playerId)
    session.submit(SETUP_TICK, { type: 'debug.teleportToDock', payload: UPGRADE_BAY }, playerId)
  }
  return session
}

const UPGRADE_BAY = { bay: 'upgrade' } as const

const researchFoam = (session: ScriptedSession, playerId: string) =>
  session.submit(
    SETUP_TICK,
    { type: 'tech-tree.unlock_node', payload: { nodeId: FOAM_NODE } },
    playerId,
  )

/** As if `playerId` had sprayed foam down to `chargesLeft`. */
const sprayDownTo = (session: ScriptedSession, chargesLeft: number, playerId = 'p1') =>
  session.submit(
    SETUP_TICK,
    {
      type: 'debug.power-up-core.setCharges',
      payload: { itemId: STABILISER_FOAM_ID, chargesLeft },
    },
    playerId,
  )

const restockFoam = (session: ScriptedSession, playerId = 'p1') =>
  session.submit(RESTOCK_TICK, restockConsumableIntent(STABILISER_FOAM_ID), playerId)

function restockedPriceOf(events: readonly DomainEvent[]): string | null {
  const restocked = events.find((event) => event.type === 'power-up-core.ConsumableRestocked')
  return restocked?.type === 'power-up-core.ConsumableRestocked' ? restocked.price : null
}

function rejectionOf(events: readonly DomainEvent[]): string | null {
  const [first] = events
  return first?.type === 'CommandRejected' ? first.reason : null
}

describe('terrain-tools: stabiliser foam restock (ticket 394)', () => {
  it("prices a charge at foam's band, 2 band-5 units on the planet it is restocked on", () => {
    const foam = terrainItemOf(STABILISER_FOAM_ID)
    expect(TERRAIN_ECONOMY.perUnitPrice).toEqual({ band: 5, oreUnits: fromSafeInteger(2) })
    for (const planet of [1, FOAM_PLANET, 10, 40, 200]) {
      const atBand = bandOrePriceAt(TERRAIN_ECONOMY.perUnitPrice, planet, planet)
      expect(toCanonical(foamRestockPriceAt(planet))).toBe(toCanonical(atBand))
      expect(foam === null ? null : itemPriceOf(foam, planet)).toEqual(foamRestockPriceAt(planet))
    }
  })

  it("restocks a researcher's sprayed stack back to the starting count, billed at foam's band", () => {
    const session = atUpgradeBay({ p1: 'researcher' }, 10)
    sprayDownTo(session, 1)
    const events = restockFoam(session)
    expect(foamChargesOf(session.state(), 'p1')).toBe(foamStartingCount())
    const bill = mul(foamRestockPriceAt(10), fromSafeInteger(foamStartingCount() - 1))
    expect(restockedPriceOf(events)).toBe(toCanonical(bill))
  })

  it('refuses a player who does not own foam, who has no charges and no restock entry', () => {
    const session = atUpgradeBay({ p1: 'researcher', p2: 'stranger' })
    expect(rejectionOf(restockFoam(session, 'p2'))).toBe('power-up-core.not_owned')
    expect(foamChargesOf(session.state(), 'p2')).toBe(0)
    const restockRows = (playerId: string) =>
      bayEntryRowsOf(session.state(), playerId).filter((row) => row.entryId.startsWith('restock-'))
    expect(restockRows('p2')).toEqual([])
    expect(restockRows('p1').map((row) => row.entryId)).toEqual([`restock-${STABILISER_FOAM_ID}`])
  })

  it('restocks only the player who sends it, never a shared stack', () => {
    const session = atUpgradeBay({ p1: 'researcher', p2: 'researcher' })
    sprayDownTo(session, 0, 'p1')
    sprayDownTo(session, 1, 'p2')
    restockFoam(session, 'p2')
    expect(foamChargesOf(session.state(), 'p1')).toBe(0)
    expect(foamChargesOf(session.state(), 'p2')).toBe(foamStartingCount())
  })

  it('reaches the same state from the same seed and commands', () => {
    const digestOfRun = () => {
      const session = atUpgradeBay({ p1: 'researcher', p2: 'researcher' }, 7)
      sprayDownTo(session, 2, 'p1')
      sprayDownTo(session, 0, 'p2')
      restockFoam(session, 'p1')
      restockFoam(session, 'p2')
      return stateDigest(session.state())
    }
    expect(digestOfRun()).toBe(digestOfRun())
  })

  it("reads the charges left and one charge's restock price on foam's card", () => {
    const session = atUpgradeBay({ p1: 'researcher' })
    sprayDownTo(session, 1)
    const view = itemSnapshotViewOf(session.state(), 'p1')
    const card = describeItem(
      { kind: 'vehicle-item', id: STABILISER_FOAM_ID },
      { playerId: 'p1', planetIndex: FOAM_PLANET, level: 1, view },
    )
    const charges = card?.statLines.find((line) => line.label === 'Charges')
    const price = formatPrice(foamRestockPriceAt(FOAM_PLANET))
    expect(charges?.now).toBe(`1 left; restock ${price} a charge at the Upgrade bay`)
  })
})
