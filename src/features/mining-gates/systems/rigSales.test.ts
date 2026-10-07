import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { toCanonical } from '../../../systems/money'
import { slice as MINING_GATES_SLICE } from '../register'
import { rigNamed, rigPriceOf, ownsRig } from './rigs'
import { RIG_SELLER } from './rigSales'

// The extractors at the Upgrade bay (ticket 248): on sale from their own planet at 40 band-5 ore
// there (`rigPriceOf`), owned once bought. No lane registers the extractor nodes on main yet, so
// a probe answers "researched" for every item.

const RESONANCE = 'rig.resonance'

const RESEARCH_PROBE: SliceDefinition = {
  id: 'research-probe',
  register: (r) => r.vehicleItemResearch({ id: 'research-probe.all', isResearched: () => true }),
}

const resonancePrice = () => toCanonical(rigPriceOf(rigNamed(RESONANCE)!))

function dockedOnPlanet(planetIndex: number): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e15' } })
  return session
}

describe('extractors on sale (ticket 248)', () => {
  it('are not sold before their own planet', () => {
    expect(RIG_SELLER.offerOf(RESONANCE, 4)).toBeNull()
  })

  it('sell from their planet on at the price fixed there, under their extractor name', () => {
    const offers = [5, 9].map((planet) => RIG_SELLER.offerOf(RESONANCE, planet))
    expect(offers.map((offer) => offer && toCanonical(offer.price))).toEqual([
      resonancePrice(),
      resonancePrice(),
    ])
    expect(offers[0]?.name).toBe(rigNamed(RESONANCE)!.name)
  })

  it('debit that price and leave the extractor owned', () =>
    withRegistrations([MINING_GATES_SLICE, RESEARCH_PROBE], () => {
      const session = dockedOnPlanet(5)
      const [bought] = session.submit(1, buyVehicleItemCommand(RESONANCE))
      expect(bought).toMatchObject({ type: 'VehicleItemPurchased', price: resonancePrice() })
      expect(ownsRig(session.state(), 'p1', RESONANCE)).toBe(true)
    }))
})
