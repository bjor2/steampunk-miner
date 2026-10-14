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

// The extractors at the Upgrade bay (ticket 248): on sale on every planet at 40 band-5 ore of
// their own planet (`rigPriceOf`; the price is the only gate, #411), owned once bought. A probe
// answers "researched" for every item, so the specs read the store alone.

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
  it('sell at the price fixed on their own planet, under their extractor name', () => {
    const offer = RIG_SELLER.offerOf(RESONANCE)
    expect(offer && toCanonical(offer.price)).toBe(resonancePrice())
    expect(offer?.name).toBe(rigNamed(RESONANCE)!.name)
  })

  it('ask the pacing bot to buy them ahead of its tracks from their own planet', () => {
    expect(RIG_SELLER.offerOf(RESONANCE)?.boughtBeforeTracksFrom).toBe(5)
  })

  it('debit that price on planet 1 too and leave the extractor owned', () =>
    withRegistrations([MINING_GATES_SLICE, RESEARCH_PROBE], () => {
      const session = dockedOnPlanet(1)
      const [bought] = session.submit(1, buyVehicleItemCommand(RESONANCE))
      expect(bought).toMatchObject({ type: 'VehicleItemPurchased', price: resonancePrice() })
      expect(ownsRig(session.state(), 'p1', RESONANCE)).toBe(true)
    }))
})
