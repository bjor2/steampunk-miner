import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { oreTier } from '../../economy/oreEconomy'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { planetParamsFor } from '../../world/planetParams'
import { oreCell } from '../../world/worldCell'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import { collectOreUnit } from '../groundDrill'
import { minedOreOf, type MinedOre } from '../minedOre'
import { dockAtBayOf, REFINERY_SITE, sessionOnPlanet } from '../refinery/refineryFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  typesOf,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { premiumLedgerOf } from './premiumLedgerState'
import { oreUnitsFrom } from '../../vehicle/cargoFixtures'

// The premium ledger's routes (ticket 844): counted at `collectOreUnit` when the premium seam names
// the unit's species, debited on every route that takes ore out without a sale (a tow's lost
// hold, a Refinery batch), set and read by the scenario call, refused never trimmed.

const AMBER_SLOT = 3
const AMBER = 'test-amber'

const premiumSlice: SliceDefinition = {
  id: 'probe',
  register: (r) =>
    r.orePremium({
      id: 'probe.premium',
      premiumSpeciesOf: (_state, _playerId, ore) => (ore.kindSlot === AMBER_SLOT ? AMBER : null),
    }),
}

const withPremium = <T>(run: () => T): T => withRegistrations([premiumSlice], run)

function planetOneState(): AuthorityState {
  return createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
}

/** A band-1 uncommon cell of planet 1, wearing `kindSlot`, as the drill mines it. */
function uncommonOre(kindSlot: number): MinedOre {
  const params = planetParamsFor(WORLD_SEED, 1)
  return minedOreOf(
    params,
    { tx: 20, ty: Math.floor(params.radiusTiles) - 3 },
    oreCell(0, 1, kindSlot),
  )
}

function withHold(state: AuthorityState, ore: Record<number, number>): AuthorityState {
  const vehicle = vehicleOf(state, 'p1')
  return withVehicle(state, 'p1', {
    ...vehicle,
    cargo: { ...vehicle.cargo, ore: oreUnitsFrom(ore) },
  })
}

const setLedger = (counts: Record<string, string>) =>
  ({ type: 'debug.setPremiumLedger', payload: { counts } }) as const

const ledgerEvents = (events: readonly { type: string }[]) =>
  events.filter((event) => event.type === 'OrePremiumLedgerChanged')

describe('premium ledger: collecting', () => {
  it('counts a stored unit of the premium species under its tier and origin', () => {
    const ore = uncommonOre(AMBER_SLOT)
    const collected = withPremium(() => collectOreUnit(planetOneState(), 'p1', ore))
    expect(premiumLedgerOf(collected.state, 'p1')).toEqual([
      { tier: ore.saleTier, origin: '1:1', speciesId: AMBER, units: '1' },
    ])
    expect(ledgerEvents(collected.events)).toEqual([
      expect.objectContaining({ change: 'collect', reason: 'mined', units: '1' }),
    ])
  })

  it('counts no other species and leaves the state its shape', () => {
    const collected = withPremium(() => collectOreUnit(planetOneState(), 'p1', uncommonOre(1)))
    expect('premiumLedger' in collected.state.players.p1).toBe(false)
    expect(typesOf(collected.events as DomainEvent[])).toEqual(['CargoAdded'])
  })

  it('counts nothing and digests as before with no provider', () => {
    const ore = uncommonOre(AMBER_SLOT)
    const plain = withRegistrations([], () => collectOreUnit(planetOneState(), 'p1', ore))
    expect('premiumLedger' in plain.state.players.p1).toBe(false)
    const withoutSlot = withRegistrations([], () =>
      collectOreUnit(planetOneState(), 'p1', { ...ore, kindSlot: 0 }),
    )
    expect(stateDigest(plain.state)).toBe(stateDigest(withoutSlot.state))
  })

  it('never counts a unit a full hold loses', () => {
    const state = planetOneState()
    const vehicle = vehicleOf(state, 'p1')
    const full = withVehicle(state, 'p1', {
      ...vehicle,
      cargo: { ...vehicle.cargo, coreFragments: Number(statsOfVehicle(vehicle).cargoCapacity) },
    })
    const collected = withPremium(() => collectOreUnit(full, 'p1', uncommonOre(AMBER_SLOT)))
    expect(premiumLedgerOf(collected.state, 'p1')).toEqual([])
  })
})

describe('premium ledger: debits', () => {
  it('loses every count with the hold on a tow', () => {
    const session = continueScriptedSession(withHold(createScriptedSession().state(), { 2: 4 }))
    session.submit(1, setLedger({ '2:1:1:test-amber': '4' }))
    session.submit(2, { type: 'undock', payload: {} })
    session.submit(3, { type: 'debug.setHull', payload: { hull: '0' } })
    const towed = session.advanceTo(200)
    expect(ledgerEvents(towed)).toEqual([
      expect.objectContaining({ change: 'debit', reason: 'lost', units: '4' }),
    ])
    expect(premiumLedgerOf(session.state(), 'p1')).toEqual([])
  })

  it('debits a Refinery batch from the lowest key first', () => {
    const tier = oreTier(3, 1)
    const session: ScriptedSession = sessionOnPlanet(3)
    const held = continueScriptedSession(withHold(session.state(), { [tier]: 6 }))
    held.submit(1, setLedger({ [`${tier}:1:3:b-ore`]: '2', [`${tier}:1:2:a-ore`]: '2' }))
    dockAtBayOf(held, 2, REFINERY_SITE, 'refinery')
    const events = held.submit(3, {
      type: 'queueRefine',
      payload: { resourceTier: tier, units: 3 },
    })
    expect(ledgerEvents(events)).toEqual([
      expect.objectContaining({ reason: 'refined', origin: '1:2', units: '2' }),
      expect.objectContaining({ reason: 'refined', origin: '1:3', units: '1' }),
    ])
    expect(premiumLedgerOf(held.state(), 'p1')).toEqual([
      { tier, origin: '1:3', speciesId: 'b-ore', units: '1' },
    ])
  })
})

describe('premium ledger: the scenario call', () => {
  it('sets and replaces the ledger, and an empty map empties it', () => {
    const session = continueScriptedSession(withHold(createScriptedSession().state(), { 2: 3 }))
    session.submit(1, setLedger({ '2:1:1:test-amber': '3' }))
    expect(premiumLedgerOf(session.state(), 'p1')).toEqual([
      { tier: 2, origin: '1:1', speciesId: AMBER, units: '3' },
    ])
    session.submit(2, setLedger({}))
    expect('premiumLedger' in session.state().players.p1).toBe(false)
  })

  it('refuses malformed counts and a tier past the hold, listing every problem', () => {
    const session = continueScriptedSession(withHold(createScriptedSession().state(), { 2: 3 }))
    const bad = session.submit(1, setLedger({ '2:1:test-amber': '1', '2:1:1:x': '0' }))
    expect(bad[0]).toMatchObject({
      type: 'CommandRejected',
      reason: 'invalid_payload',
      problems: [
        'counts.2:1:test-amber must be keyed tier:s:p:speciesId',
        'counts.2:1:1:x must be a whole count from 1',
      ],
    })
    const over = session.submit(2, setLedger({ '2:1:1:test-amber': '4' }))
    expect(over[0]).toMatchObject({
      type: 'CommandRejected',
      problems: ['counts: tier 2 counts more premium units than the hold holds'],
    })
    expect(premiumLedgerOf(session.state(), 'p1')).toEqual([])
  })
})
