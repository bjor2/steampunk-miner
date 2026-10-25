import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { liftedSalePrice, type SaleLift } from '../../economy/saleLift'
import { oreSalePrice, oreTier } from '../../economy/oreEconomy'
import { add, cmp, div, fromSafeInteger, mul, toCanonical, type Money } from '../../money'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../authorityState'
import { applyCommand } from '../applyCommand'
import type { DomainEvent } from '../domainEvent'
import { tierSaleOf } from '../oreSaleLift'
import {
  continueScriptedSession,
  createScriptedSession,
  typesOf,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'
import { premiumLedgerOf } from './premiumLedgerState'

// The premium ledger at the Sell bay (ticket 844; the TD ruling on #821 as amended, Systems'
// goldens): N premium units mined on this planet plus M commons of their tier sell for
// N·⌊V·max(5/4, other lifts)⌋ + M·⌊V·max(1, other lifts)⌋, only at their origin's merchant, the
// premium paid once and never stacked with the beacon.

const MERCHANT = { num: 5n, den: 4n }
const AMBER = 'test-amber'
const LENS = 'test-lens'
const sellAll = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

/** A merchant slice: one premium species and a premium row paying `lift` at the units' origin. */
function merchantSlice(lift: SaleLift = MERCHANT): SliceDefinition {
  return {
    id: 'probe',
    register: (r) => {
      r.orePremium({ id: 'probe.premium', premiumSpeciesOf: () => AMBER })
      r.oreSaleLift({ id: 'probe.merchant', pays: 'premium', liftOf: () => lift })
    },
  }
}

const withMerchant = <T>(run: () => T, lift?: SaleLift): T =>
  withRegistrations([merchantSlice(lift)], run)

/** The hold holds `ore` units per tier: there is no scenario field for cargo yet (Build 4). */
function withHold(state: AuthorityState, ore: Record<number, number>): AuthorityState {
  const vehicle = vehicleOf(state, 'p1')
  return withVehicle(state, 'p1', { ...vehicle, cargo: { ...vehicle.cargo, ore } })
}

function setLedger(session: ScriptedSession, tick: number, counts: Record<string, string>) {
  const events = session.submit(tick, { type: 'debug.setPremiumLedger', payload: { counts } })
  expect(typesOf(events)).toEqual(['DebugCommandApplied'])
}

/** A planet-1 session holding `ore`, then the scenario's ledger. */
function sessionHolding(ore: Record<number, number>, counts: Record<string, string>) {
  const session = continueScriptedSession(withHold(createScriptedSession().state(), ore))
  setLedger(session, 1, counts)
  return session
}

/** Every unit of the hold sold at this planet's Sell bay. */
function sellAllHere(session: ScriptedSession, tick: number): DomainEvent[] {
  if (session.vehicle().mode === 'docked') session.submit(tick, { type: 'undock', payload: {} })
  session.submit(tick, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return session.submit(tick, sellAll)
}

function moveToPlanet(session: ScriptedSession, tick: number, planetIndex: number) {
  session.submit(tick, { type: 'debug.setPlanet', payload: { planetIndex } })
}

const soldValueOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'ResourceSold')

const eventsOf = (events: readonly DomainEvent[], type: DomainEvent['type']) =>
  events.filter((event) => event.type === type)

const times = (price: Money, units: number) => mul(price, fromSafeInteger(units))

/** N premium plus M plain units of `tier` at `lift`: the golden every sale is held to. */
function expectedValue(tier: number, premium: number, plain: number, lift: SaleLift): string {
  return toCanonical(
    add(times(liftedSalePrice(tier, lift), premium), times(oreSalePrice(tier), plain)),
  )
}

describe('premium sale at the origin merchant', () => {
  it('sells N premium plus M commons for N·⌊1.25V⌋ + M·V, and says which lift paid', () => {
    const session = sessionHolding({ 2: 5 }, { [`2:1:1:${AMBER}`]: '3' })
    const events = withMerchant(() => sellAllHere(session, 10))
    expect(soldValueOf(events)).toMatchObject({ value: '8.625e+1' })
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(2, 3, 2, MERCHANT) })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([
      expect.objectContaining({
        tier: 2,
        speciesId: AMBER,
        units: '3',
        source: 'probe.merchant',
        lift: '5/4',
      }),
    ])
  })

  it('debits the sold tiers from the ledger, so the premium is paid once', () => {
    const session = sessionHolding({ 2: 5 }, { [`2:1:1:${AMBER}`]: '3' })
    const events = withMerchant(() => sellAllHere(session, 10))
    expect(eventsOf(events, 'OrePremiumLedgerChanged')).toEqual([
      expect.objectContaining({ change: 'debit', reason: 'sold', units: '3', origin: '1:1' }),
    ])
    expect('premiumLedger' in session.state().players.p1).toBe(false)
  })

  it('pays plain V once the ledger is debited to 0', () => {
    const session = sessionHolding({ 2: 5 }, {})
    const events = withMerchant(() => sellAllHere(session, 10))
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(2, 0, 5, MERCHANT) })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([])
  })

  it('takes the beacon over the premium when it lifts more, never the product of both', () => {
    const session = sessionHolding({ 2: 5 }, { [`2:1:1:${AMBER}`]: '3' })
    session.submit(2, { type: 'debug.setArtefact', payload: { optionId: 'artefact.assay_beacon' } })
    const events = withMerchant(() => sellAllHere(session, 10))
    const beacon = { num: 3n, den: 2n }
    expect(soldValueOf(events)).toMatchObject({
      value: toCanonical(times(liftedSalePrice(2, beacon), 5)),
    })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([
      expect.objectContaining({ units: '3', source: 'kernel.assay_beacon', lift: '3/2' }),
    ])
  })

  it('sells premium units away from their origin at plain V', () => {
    const session = sessionHolding({ 2: 4 }, { [`2:1:1:${AMBER}`]: '4' })
    moveToPlanet(session, 5, 2)
    const events = withMerchant(() => sellAllHere(session, 10))
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(2, 0, 4, MERCHANT) })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([])
  })

  it('carries away, sells one tier at plain V, then pays the rest its premium once at home', () => {
    const session = sessionHolding(
      { 2: 4, 3: 2 },
      { [`2:1:1:${AMBER}`]: '4', [`3:1:1:${AMBER}`]: '2' },
    )
    moveToPlanet(session, 5, 2)
    session.submit(6, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    const away = withMerchant(() =>
      session.submit(7, { type: 'sellCargo', payload: { resourceTier: 2 } }),
    )
    expect(soldValueOf(away)).toMatchObject({ value: expectedValue(2, 0, 4, MERCHANT) })
    moveToPlanet(session, 8, 1)
    const home = withMerchant(() => sellAllHere(session, 10))
    expect(soldValueOf(home)).toMatchObject({ value: expectedValue(3, 2, 0, MERCHANT) })
    expect(premiumLedgerOf(session.state(), 'p1')).toEqual([])
  })

  it('keeps the ledger through a departure and back, never clearing it', () => {
    const session = sessionHolding({ 2: 3 }, { [`2:1:1:${AMBER}`]: '3' })
    moveToPlanet(session, 5, 2)
    moveToPlanet(session, 6, 1)
    expect(premiumLedgerOf(session.state(), 'p1')).toEqual([
      { tier: 2, origin: '1:1', speciesId: AMBER, units: '3' },
    ])
  })

  it("pays only this planet's units in a hold of two origins, and debits them in key order", () => {
    const counts = { [`2:1:2:${LENS}`]: '3', [`2:1:1:${AMBER}`]: '2' }
    const session = sessionHolding({ 2: 6 }, counts)
    const events = withMerchant(() => sellAllHere(session, 10))
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(2, 2, 4, MERCHANT) })
    expect(eventsOf(events, 'OrePremiumLedgerChanged')).toEqual([
      expect.objectContaining({ origin: '1:1', units: '2' }),
      expect.objectContaining({ origin: '1:2', units: '3' }),
    ])
  })
})

describe('premium sale goldens at g = 1, 6 and 1e6', () => {
  const PLANETS = [1, 6, 1_000_000]

  function tierSaleAt(planet: number, lift?: SaleLift) {
    const tier = oreTier(planet, 1) + 1
    const start = createAuthorityState({
      planetIndex: planet,
      planetSeed: WORLD_SEED,
      playerIds: ['p1'],
    })
    const counts = { [`${tier}:1:${planet}:${AMBER}`]: '3' }
    const command = { type: 'debug.setPremiumLedger', payload: { counts } } as const
    const ledgered = applyCommand(withHold(start, { [tier]: 5 }), {
      playerId: 'p1',
      tick: 1,
      seq: 1,
      ...command,
    })
    return {
      tier,
      sale: withMerchant(() => tierSaleOf(ledgered.state, 'p1', { tier, amount: 5 }), lift),
    }
  }

  it('sells 3 premium and 2 plain units at ⌊V·5/4⌋ and ⌊V⌋ on every g', () => {
    for (const planet of PLANETS) {
      const { tier, sale } = tierSaleAt(planet)
      expect(toCanonical(sale.value)).toBe(expectedValue(tier, 3, 2, MERCHANT))
    }
  })

  it('keeps the merchant premium at or under 5/4 of V on every g', () => {
    for (const planet of PLANETS) {
      const { tier, sale } = tierSaleAt(planet)
      const lifted = div(sale.value, times(oreSalePrice(tier), 5))
      expect(cmp(lifted, div(fromSafeInteger(5), fromSafeInteger(4)))).toBeLessThanOrEqual(0)
    }
  })

  it('refuses a premium row lifting past 5/4 on every g', () => {
    for (const planet of PLANETS) {
      expect(() => tierSaleAt(planet, { num: 13n, den: 10n })).toThrow(/past 5\/4/)
    }
  })
})
