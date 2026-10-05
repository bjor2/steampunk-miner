import { describe, expect, it } from 'vitest'
import { toCanonical } from '../money'
import { shopPanelOf } from '../views/shopPanel'
import type { DomainEvent } from './domainEvent'
import { serviceQuote } from './platformServices'
import {
  createScriptedSession,
  dockInBay,
  mineTile,
  surfaceOreTiles,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'

const sellAll = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const
const holdBeacon = {
  type: 'debug.setArtefact',
  payload: { optionId: 'artefact.assay_beacon' },
} as const

/** Three band-1 ore units (tier 1, `floorMilli(V(1))` = 10), then docked in the Sell bay. */
function dockedWithThreeOre(withBeacon: boolean): ScriptedSession {
  const session = createScriptedSession()
  if (withBeacon) session.submit(1, holdBeacon)
  surfaceOreTiles(3).forEach((tile, index) => mineTile(session, 10 + 50 * index, tile))
  dockInBay(session, 200, 'sell')
  return session
}

const soldValueOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'ResourceSold')

describe('selling with assay_beacon (#46)', () => {
  it('sells band-1 ore at the band-3 unit price and says so before the sale', () => {
    const session = dockedWithThreeOre(true)
    const events = session.submit(201, sellAll)
    expect(typesOf(events)).toEqual(['ArtefactAssayApplied', 'ResourceSold'])
    expect(events[0]).toMatchObject({ tier: 1, band: 1, unitPrice: '2.25e+1' })
    expect(soldValueOf(events)).toMatchObject({ value: '6.75e+1' })
  })

  it('sells the same ore at its own price without the beacon', () => {
    const session = dockedWithThreeOre(false)
    const events = session.submit(201, sellAll)
    expect(typesOf(events)).toEqual(['ResourceSold'])
    expect(soldValueOf(events)).toMatchObject({ value: '3e+1' })
  })

  it('shows the lifted unit value on the shop row and in the sell-all quote', () => {
    const session = dockedWithThreeOre(true)
    const [row] = shopPanelOf(session.state(), 'p1').rows
    expect(row).toMatchObject({ tier: 1, isAssayed: true, unitValue: { exact: '2.25e+1' } })
    expect(toCanonical(serviceQuote(session.state(), 'p1').saleValue)).toBe('6.75e+1')
  })

  it('leaves the workshop and charging prices alone', () => {
    const lifted = serviceQuote(dockedWithThreeOre(true).state(), 'p1')
    const plain = serviceQuote(dockedWithThreeOre(false).state(), 'p1')
    expect(toCanonical(lifted.repairCost)).toBe(toCanonical(plain.repairCost))
    expect(toCanonical(lifted.rechargeCost)).toBe(toCanonical(plain.rechargeCost))
  })
})
