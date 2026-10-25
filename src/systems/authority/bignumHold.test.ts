import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { cargoCapacity } from '../economy/vehicleStats'
import { add, fromBigInt, mul, toCanonical } from '../money'
import { cargoUnitsOf, oreUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import { countToJson } from '../wholeCount'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { toCanonicalJson } from './canonicalJson'
import type { DomainEvent } from './domainEvent'
import { dockAtBayOf, REFINERY_SITE, sessionOnPlanet } from './refinery/refineryFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  mineTile,
  surfaceOreTiles,
  type ScriptedSession,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// The bignum hold (ticket 849, the TD's Q4 on #823): the hold's capacity and every per-tier count
// are bigint, so cargo is capped by the economy only. Levels 1, 99 and 1e6 are the VS's goldens,
// 361 and 362 the last hold under 2^53 and the first past it.

const LARGEST_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
const LEVEL_1E6 = 1_000_000
/** `round(10 x 1.10^c)` at 40 significant digits, the economy's precision (#5). */
const CAPACITY_1E6_DIGITS = '4843487966033034847864921171763203134305'

/** The session's state with the hold at cargo level `level`, holding `units` of `tier`. */
function holding(state: AuthorityState, level: number, tier: number, units: bigint) {
  const vehicle = vehicleOf(state, 'p1')
  return withVehicle(state, 'p1', {
    ...vehicle,
    levels: { ...vehicle.levels, cargo_hold: level },
    cargo: { ...vehicle.cargo, ore: { [String(tier)]: units } },
  })
}

function sellAllAtTheSellBay(session: ScriptedSession, tick: number): DomainEvent[] {
  if (session.vehicle().mode === 'docked') session.submit(tick, { type: 'undock', payload: {} })
  session.submit(tick, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return session.submit(tick, { type: 'sellCargo', payload: { resourceTier: 'all' } })
}

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_849', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
  return sink.events
}

const eventOf = (events: readonly DomainEvent[], type: DomainEvent['type']) =>
  events.find((event) => event.type === type)

/** Through the save's JSON and back, as a save and load does. */
function savedAndRead(state: AuthorityState): { text: string; state: AuthorityState } {
  const text = JSON.stringify(takeSnapshot(state))
  const restored = readSnapshot(JSON.parse(text))
  if (!('state' in restored)) throw new Error(restored.problems.join('; '))
  return { text, state: restored.state }
}

describe('bignum hold (ticket 849)', () => {
  it('holds round(10 x 1.10^c) units at cargo levels 1, 99, 361, 362 and 1e6 with no throw', () => {
    expect(cargoCapacity(1)).toBe(11n)
    expect(cargoCapacity(99)).toBe(125_278n)
    expect(cargoCapacity(361)).toBe(8_765_149_786_991_003n)
    expect(cargoCapacity(361) <= LARGEST_SAFE).toBe(true)
    expect(cargoCapacity(362)).toBe(9_641_664_765_690_103n)
    expect(cargoCapacity(362) > LARGEST_SAFE).toBe(true)
    const huge = cargoCapacity(LEVEL_1E6).toString()
    expect(huge).toHaveLength(41_394)
    expect(huge).toBe(CAPACITY_1E6_DIGITS.padEnd(41_394, '0'))
  })

  it('digests a hold of safe counts to the bytes a safe-integer hold wrote, so replays match', () => {
    const hold = { ore: { '1': 5n, '7': LARGEST_SAFE }, coreFragments: 2 }
    const asNumbers = { ore: { '1': 5, '7': Number.MAX_SAFE_INTEGER }, coreFragments: 2 }
    expect(toCanonicalJson(hold)).toBe(toCanonicalJson(asNumbers))
    expect(toCanonicalJson({ units: LARGEST_SAFE + 1n })).toBe('{"units":9007199254740992}')
  })

  it('collects a unit into a hold past 2^53 at cargo level 362, then refuses one past full', () => {
    const [first, second] = surfaceOreTiles(2)
    const capacity = cargoCapacity(362)
    const start = createScriptedSession().state()
    const session = continueScriptedSession(holding(start, 362, 1, capacity - 1n))
    const collected = mineTile(session, 10, first)
    expect(eventOf(collected, 'CargoAdded')).toBeDefined()
    expect(cargoUnitsOf(session.vehicle().cargo)).toBe(capacity)
    expect(eventOf(mineTile(session, 60, second), 'StorageFull')).toEqual(
      expect.objectContaining({ lostUnits: 1 }),
    )
    expect(cargoUnitsOf(session.vehicle().cargo)).toBe(capacity)
  })

  it('sells a full hold of cargo level 1e6 for its units at the unit price, to the coin', () => {
    const capacity = cargoCapacity(LEVEL_1E6)
    const start = createScriptedSession().state()
    const session = continueScriptedSession(holding(start, LEVEL_1E6, 1, capacity))
    const before = session.state().players.p1.wallet
    const events = sellAllAtTheSellBay(session, 1)
    const value = mul(oreSalePrice(1), fromBigInt(capacity))
    expect(eventOf(events, 'ResourceSold')).toMatchObject({
      items: [{ tier: 1, amount: capacity }],
      value: toCanonical(value),
    })
    expect(session.vehicle().cargo.ore).toEqual({})
    expect(toCanonical(session.state().players.p1.wallet)).toBe(toCanonical(add(before, value)))
  })

  it('logs a sale past 2^53 with its units as decimal text, and one below it as a number', () => {
    const sold = (amount: bigint): DomainEvent => ({
      tick: 1,
      seq: 1,
      playerId: 'p1',
      type: 'ResourceSold',
      items: [{ tier: 1, amount }],
      value: '1e+1',
      mode: 'all',
      coinsShown: 1,
    })
    const lines = linesOf([sold(LARGEST_SAFE), sold(cargoCapacity(LEVEL_1E6))])
    expect(lines.map((line) => line.data)).toEqual([
      expect.objectContaining({ items: [{ tier: 1, amount: Number.MAX_SAFE_INTEGER }] }),
      expect.objectContaining({ items: [{ tier: 1, amount: String(cargoCapacity(LEVEL_1E6)) }] }),
    ])
    lines.forEach((line) => expect(runEventProblems(line)).toEqual([]))
  })

  it('queues a Refinery batch of half a 1e6 hold asked for in decimal text, and saves it exactly', () => {
    const tier = oreTier(3, 1)
    const capacity = cargoCapacity(LEVEL_1E6)
    const onPlanet = sessionOnPlanet(3).state()
    const session = continueScriptedSession(holding(onPlanet, LEVEL_1E6, tier, capacity))
    dockAtBayOf(session, 1, REFINERY_SITE, 'refinery')
    const asked = { resourceTier: tier, units: countToJson(capacity) }
    const events = session.submit(2, { type: 'queueRefine', payload: asked })
    const half = capacity / 2n
    expect(eventOf(events, 'RefineQueued')).toMatchObject({ units: half, requestedUnits: capacity })
    expect(oreUnitsOf(session.vehicle().cargo, tier)).toBe(capacity - half)
    expect(session.state().platform.refinerySlots[0]).toMatchObject({ units: half })
    const saved = savedAndRead(session.state())
    expect(saved.text).toContain(`"units":"${half}"`)
    expect(saved.state).toEqual(session.state())
  })

  it('carries a hold past 2^53 through a save and load to the unit, never as a float', () => {
    const capacity = cargoCapacity(362)
    const state = holding(createScriptedSession().state(), 362, 4, capacity)
    const saved = savedAndRead(state)
    expect(saved.text).toContain(`"ore":{"4":"${capacity}"}`)
    expect(saved.state).toEqual(state)
    expect(stateDigest(saved.state)).toBe(stateDigest(state))
    expect(statsOfVehicle(vehicleOf(saved.state, 'p1')).cargoCapacity).toBe(capacity)
  })
})
