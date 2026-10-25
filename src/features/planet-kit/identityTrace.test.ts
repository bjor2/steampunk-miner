import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { liftedSalePrice, NO_LIFT } from '../../systems/economy/saleLift'
import { cmp, fromSafeInteger, mul, sub, toCanonical, ZERO_MONEY } from '../../systems/money'
import { emptyIdentityTrace, kitSpentOf, traceIdentityStep } from './identityTrace'
import { buyKitItemIntent } from './systems/kitBuyRules'
import { MERCHANT_PREMIUM_LIFT, merchantPremiumLiftOf } from './systems/merchantPremium'
import { PLANET_KITS } from './systems/planetKitRows'

// The PK7 identity trace (ticket 826): folded from the bot's steps, it keeps per planet what was
// bought at the merchant, every fall of the wallet, the merchant's premium over plain V and the
// premium ore the first trip mined; a debug step's money is never play.

const setMoney: CommandIntent = { type: 'debug.setMoney', payload: { amount: '1e6' } }
const toSellBay: CommandIntent = { type: 'debug.teleportToDock', payload: { bay: 'sell' } }

/** Planet 1 at the Sell bay with money, every step folded into a fresh trace. */
function tracedSession() {
  const scripted = createScriptedSession()
  const trace = emptyIdentityTrace()
  const step = (intent: CommandIntent) => {
    const events = scripted.submit(0, intent)
    traceIdentityStep(trace, scripted.state(), 'p1', events)
  }
  return { scripted, trace, step }
}

function stamped(body: object): DomainEvent {
  return { tick: 0, ...body } as DomainEvent
}

describe('planet kit: the PK7 identity trace (ticket 826)', () => {
  it('counts a merchant buy as the planet’s decision and its price as money spent', () => {
    const { scripted, trace, step } = tracedSession()
    step(setMoney)
    step(toSellBay)
    const before = scripted.state().players.p1.wallet
    step(buyKitItemIntent('cache_crate'))
    const planet = trace.planets.get(1)!
    const paid = sub(before, scripted.state().players.p1.wallet)
    expect([...planet.kitBuys.keys()]).toEqual(['cache_crate'])
    expect(cmp(kitSpentOf(planet), paid)).toBe(0)
    expect(cmp(planet.spent, paid)).toBe(0)
  })

  it('never counts a debug step’s money as spent', () => {
    const { scripted, trace, step } = tracedSession()
    step(setMoney)
    step({ type: 'debug.setMoney', payload: { amount: '0' } })
    expect(scripted.state().players.p1.wallet).toEqual(ZERO_MONEY)
    expect(cmp(trace.planets.get(1)!.spent, ZERO_MONEY)).toBe(0)
  })

  it('keeps the merchant premium over plain V, and no other lift', () => {
    const { scripted, trace } = tracedSession()
    const lifted = (source: string) =>
      stamped({ type: 'OreSaleLifted', tier: 3, speciesId: 'x', units: '4', source, lift: '5/4' })
    traceIdentityStep(trace, scripted.state(), 'p1', [
      lifted(MERCHANT_PREMIUM_LIFT.id),
      lifted('kernel.assay_beacon'),
    ])
    const premium = liftedSalePrice(3, merchantPremiumLiftOf(PLANET_KITS))
    const extra = mul(sub(premium, liftedSalePrice(3, NO_LIFT)), fromSafeInteger(4))
    expect(toCanonical(trace.planets.get(1)!.premiumIncome)).toBe(toCanonical(extra))
  })

  it('counts the planet’s premium ore mined before its first haul docked, and none after', () => {
    const { scripted, trace } = tracedSession()
    const mined = (units: string, origin = '1:1') =>
      stamped({
        type: 'OrePremiumLedgerChanged',
        change: 'collect',
        reason: 'mined',
        tier: 3,
        origin,
        speciesId: 'x',
        units,
      })
    const haulDocked = stamped({
      type: 'DockEntered',
      bay: 'sell',
      cargoUnits: 5n,
      energy: 0,
      hull: '1',
    })
    traceIdentityStep(trace, scripted.state(), 'p1', [mined('2'), mined('9', '1:2')])
    traceIdentityStep(trace, scripted.state(), 'p1', [haulDocked, mined('7')])
    expect(trace.planets.get(1)!.firstTripPremiumUnits).toBe(2n)
  })
})
