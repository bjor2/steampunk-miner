import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
} from '../../../systems/authority/authorityState'
import { tierSaleOf } from '../../../systems/authority/oreSaleLift'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  premiumLedgerOf,
  withPremiumLedger,
} from '../../../systems/authority/premium/premiumLedgerState'
import {
  continueScriptedSession,
  createScriptedSession,
  WORLD_SEED,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { oreSalePrice, oreTier } from '../../../systems/economy/oreEconomy'
import { liftedSalePrice } from '../../../systems/economy/saleLift'
import { add, fromSafeInteger, mul, toCanonical } from '../../../systems/money'
import { slice as planetKit } from '../register'
import { premiumMovedWith } from './containerPremium'
import { dropContainerIntent, pickupContainerIntent } from './containerRules'
import { placedContainersIn, sessionPlanetKeyOf } from './containerSection'
import {
  containersOn,
  dropContainer,
  NO_PLACED_CONTAINERS,
  pickupContainer,
} from './placedContainers'

// The premium ledger rides with a Cache Crate (ticket 844; Systems' crate rule on #821 and the TD
// amendment): a drop moves the counts into the crate under the same key, a pickup moves them back
// up to what fits, nothing is debited, and the premium is paid once at the origin's merchant.

const AMBER = 'test-amber'
const LENS = 'test-lens'
const MERCHANT = { num: 5n, den: 4n }
const CRATE = 'cache_crate'

const merchant: SliceDefinition = {
  id: 'probe',
  register: (r) => {
    r.orePremium({ id: 'probe.premium', premiumSpeciesOf: () => AMBER })
    r.oreSaleLift({ id: 'probe.merchant', pays: 'premium', liftOf: () => MERCHANT })
  },
}

/**
 * The slice's crate rules with the probe merchant standing in for its own premium (ticket 821),
 * so the moves are judged on any g, a merchant there or not.
 */
const crateRulesOnly: SliceDefinition = {
  id: planetKit.id,
  register: (r) => planetKit.register({ ...r, orePremium: () => {}, oreSaleLift: () => {} }),
}

const withKit = <T>(run: () => T): T => withRegistrations([crateRulesOnly, merchant], run)

/** A session on `planet` holding N premium (this planet's) plus M commons of its tier-2-up ore. */
function holdingOn(planet: number, premium: number, commons: number) {
  const start = createScriptedSession()
  const session = continueScriptedSession(start.state())
  if (planet !== 1) session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: planet } })
  const tier = oreTier(planet, 1) + 1
  const vehicle = vehicleOf(session.state(), 'p1')
  const held = continueScriptedSession(
    withVehicle(session.state(), 'p1', {
      ...vehicle,
      cargo: { ...vehicle.cargo, ore: { [tier]: BigInt(premium + commons) } },
    }),
  )
  const counts = { [`${tier}:1:${planet}:${AMBER}`]: String(premium) }
  withKit(() => held.submit(1, { type: 'debug.setPremiumLedger', payload: { counts } }))
  return { session: held, tier }
}

function sellAllHere(session: ScriptedSession, tick: number): DomainEvent[] {
  if (session.vehicle().mode === 'docked') session.submit(tick, { type: 'undock', payload: {} })
  session.submit(tick, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return session.submit(tick, { type: 'sellCargo', payload: { resourceTier: 'all' } })
}

const soldValueOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'ResourceSold')

const ledgerMoves = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'OrePremiumLedgerChanged')

function goldenValue(tier: number, premium: number, commons: number): string {
  const lifted = mul(liftedSalePrice(tier, MERCHANT), fromSafeInteger(premium))
  return toCanonical(add(lifted, mul(oreSalePrice(tier), fromSafeInteger(commons))))
}

/** Drop the whole hold, pick the crate up again and sell everything at this planet's Sell bay. */
function dropPickUpAndSell(session: ScriptedSession) {
  const dropped = withKit(() => session.submit(2, dropContainerIntent(CRATE)))
  const [crate] = containersOn(
    placedContainersIn(session.state()),
    sessionPlanetKeyOf(session.state()),
  )
  const picked = withKit(() => session.submit(3, pickupContainerIntent(crate.containerId)))
  const sold = withKit(() => sellAllHere(session, 4))
  return { dropped, picked, sold, crate }
}

describe('premium counts in a Cache Crate', () => {
  it('moves every count into the crate on a drop and back on a pickup, debiting none', () => {
    const { session } = holdingOn(1, 3, 2)
    const { dropped, picked, crate } = dropPickUpAndSell(session)
    expect(crate.premium).toEqual([{ tier: 2, origin: '1:1', speciesId: AMBER, units: '3' }])
    expect(ledgerMoves(dropped)).toEqual([
      expect.objectContaining({ change: 'move', reason: 'container_drop', units: '3' }),
    ])
    expect(ledgerMoves(picked)).toEqual([
      expect.objectContaining({ change: 'move', reason: 'container_pickup', units: '3' }),
    ])
  })

  for (const planet of [1, 6]) {
    it(`pays N·⌊1.25V⌋ + M·V once after a drop, pickup and home sale on g = ${planet}`, () => {
      const { session, tier } = holdingOn(planet, 3, 2)
      const { sold } = dropPickUpAndSell(session)
      expect(soldValueOf(sold)).toMatchObject({ value: goldenValue(tier, 3, 2) })
      expect(premiumLedgerOf(session.state(), 'p1')).toEqual([])
      const again = withKit(() =>
        session.submit(5, { type: 'sellCargo', payload: { resourceTier: 'all' } }),
      )
      expect(soldValueOf(again)).toBeUndefined()
    })
  }

  it('keeps the crate’s counts through a save and load', () => {
    const { session } = holdingOn(1, 3, 2)
    withKit(() => session.submit(2, dropContainerIntent(CRATE)))
    const restored = withKit(() =>
      readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state())))),
    )
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    expect(withKit(() => placedContainersIn(restored.state))).toEqual(
      withKit(() => placedContainersIn(session.state())),
    )
  })
})

describe('premium counts in a Cache Crate at g = 1e6', () => {
  const G = 1_000_000
  const TIER = oreTier(G, 1) + 1
  const KEY = `1:${G}`

  it('pays N·⌊1.25V⌋ + M·V once after the pure drop and pickup', () => {
    const hold = { ore: { [TIER]: 5n }, coreFragments: 0 }
    const premium = [{ tier: TIER, origin: KEY, speciesId: AMBER, units: '3' }]
    const drop = { planetKey: KEY, kind: CRATE, ownerId: 'p1', access: 'owner' as const }
    const dropped = dropContainer(NO_PLACED_CONTAINERS, {
      ...drop,
      cell: { tx: 0, ty: 0 },
      hold,
      premium,
      cap: 3,
    })
    if (!dropped.isDropped) throw new Error(dropped.reason)
    const picked = pickupContainer(dropped.placed, {
      planetKey: KEY,
      playerId: 'p1',
      containerId: dropped.container.containerId,
      hold: dropped.hold,
      capacity: 5n,
    })
    if (!picked.isPickedUp) throw new Error(picked.reason)
    expect(picked.movedPremium).toEqual(premium)
    const start = createAuthorityState({
      planetIndex: G,
      planetSeed: WORLD_SEED,
      playerIds: ['p1'],
    })
    const vehicle = vehicleOf(start, 'p1')
    const held = withVehicle(start, 'p1', { ...vehicle, cargo: picked.hold })
    const state = withPremiumLedger(held, 'p1', picked.movedPremium)
    const sale = withKit(() => tierSaleOf(state, 'p1', { tier: TIER, amount: 5n }))
    expect(toCanonical(sale.value)).toBe(goldenValue(TIER, 3, 2))
  })
})

describe('premium counts moved with a partial pickup', () => {
  const premium = [
    { tier: 2, origin: '1:1', speciesId: AMBER, units: '2' },
    { tier: 2, origin: '1:2', speciesId: LENS, units: '2' },
    { tier: 5, origin: '1:1', speciesId: AMBER, units: '1' },
  ]

  it('moves back per tier at most the units that tier moved, lowest key first', () => {
    const moved = premiumMovedWith(premium, { ore: { '2': 3n }, coreFragments: 0 })
    expect(moved.taken).toEqual([
      { tier: 2, origin: '1:1', speciesId: AMBER, units: '2' },
      { tier: 2, origin: '1:2', speciesId: LENS, units: '1' },
    ])
    expect(moved.left).toEqual([
      { tier: 2, origin: '1:2', speciesId: LENS, units: '1' },
      { tier: 5, origin: '1:1', speciesId: AMBER, units: '1' },
    ])
  })

  it('leaves every count in the crate when no ore moved', () => {
    expect(premiumMovedWith(premium, { ore: {}, coreFragments: 4 })).toEqual({
      taken: [],
      left: premium,
    })
  })
})
