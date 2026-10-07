import { describe, expect, it } from 'vitest'
import { oreTier } from '../../economy/oreEconomy'
import { refinedValue } from '../../economy/refineryEconomy'
import { add, sub, toCanonical } from '../../money'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import type { DomainEvent } from '../domainEvent'
import type { ScriptedSession } from '../scriptedSession'
import { dockAtBayOf, mineSurfaceOre, REFINERY_SITE, sessionOnPlanet } from './refineryFixtures'
import { stepOfMajor } from '../../economy/upgradeSteps'

/** Planet 3's band-1 ore, the tier the fixtures mine. */
const TIER = oreTier(3, 1)
/** 180 s at 60 ticks a second. */
const REFINE_TICKS = 180 * 60

const queue = (units: number, resourceTier = TIER) =>
  ({ type: 'queueRefine', payload: { resourceTier, units } }) as const
const collect = { type: 'collectRefined', payload: {} } as const
const buySlot = { type: 'buyRefinerySlot', payload: {} } as const
/** A track at major `level`, sent as its step (#180). */
const setUpgrade = (upgradeId: string, level: number) =>
  ({ type: 'debug.setUpgrade', payload: { upgradeId, level: stepOfMajor(level) } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')
const eventOf = (events: readonly DomainEvent[], type: DomainEvent['type']) =>
  events.find((event) => event.type === type)
const heldOf = (session: ScriptedSession) => session.vehicle().cargo.ore[String(TIER)] ?? 0

/** On planet 3 with a drill that digs its band 1, 6 band-1 ore in the hold, docked at the Refinery bay. */
function dockedAtRefineryWithOre(money = '0'): { session: ScriptedSession; tick: number } {
  const session = sessionOnPlanet(3, money)
  session.submit(0, setUpgrade('drill_power', 25))
  session.submit(0, setUpgrade('drill_tip', 13))
  const tick = mineSurfaceOre(session, 10, 6)
  dockAtBayOf(session, tick, REFINERY_SITE, 'refinery')
  return { session, tick }
}

describe('refinery queue', () => {
  it('moves the queued ore out of the hold at once into the first free slot', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    const events = session.submit(tick + 1, queue(4))
    expect(eventOf(events, 'RefineQueued')).toMatchObject({
      slot: 0,
      tier: TIER,
      units: 4,
      requestedUnits: 4,
    })
    expect(heldOf(session)).toBe(2)
    expect(session.state().platform.refinerySlots[0]).toEqual({
      owner: 'p1',
      tier: TIER,
      units: 4,
      readyAtTick: tick + 1 + REFINE_TICKS,
      queuedTick: tick + 1,
      queuedPlanet: 3,
    })
  })

  it('clamps a request past half the hold to floor(0.5 x cargoCapacity) and logs what was asked', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    const events = session.submit(tick + 1, queue(50))
    expect(eventOf(events, 'RefineQueued')).toMatchObject({ units: 5, requestedUnits: 50 })
    expect(heldOf(session)).toBe(1)
  })

  it('refuses core fragments: they go to the core bay', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    const coreTier = oreTier(3, 6)
    expect(rejectionOf(session.submit(tick + 1, queue(1, coreTier)))).toMatchObject({
      reason: 'nothing_to_refine',
      problems: ['core fragments never refine; they go to the core bay'],
    })
  })

  it('refuses a tier the hold does not have', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    expect(rejectionOf(session.submit(tick + 1, queue(1, TIER + 1)))).toMatchObject({
      reason: 'nothing_to_refine',
    })
  })

  it('refuses a second batch while the one slot is busy', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    session.submit(tick + 1, queue(1))
    expect(rejectionOf(session.submit(tick + 2, queue(1)))).toMatchObject({ reason: 'slots_busy' })
  })

  it('refuses to queue anywhere but the Refinery bay', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    dockAtBayOf(session, tick + 1, REFINERY_SITE, 'sell')
    expect(rejectionOf(session.submit(tick + 2, queue(1)))).toMatchObject({ reason: 'wrong_bay' })
  })

  it('cannot be used or bought before planet 3', () => {
    const session = sessionOnPlanet(2, '1e30')
    session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    expect(rejectionOf(session.submit(2, queue(1)))).toMatchObject({ reason: 'refinery_locked' })
    expect(rejectionOf(session.submit(3, buySlot))).toMatchObject({ reason: 'refinery_locked' })
  })
})

describe('refinery timer and collection', () => {
  it('is not ready at 179 s and ready at 180 s of sim time', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    const queued = tick + 1
    session.submit(queued, queue(4))
    dockAtBayOf(session, queued + 1, REFINERY_SITE, 'sell')
    expect(rejectionOf(session.submit(queued + 179 * 60, collect))).toMatchObject({
      reason: 'nothing_to_collect',
    })
    expect(eventOf(session.submit(queued + 180 * 60, collect), 'RefineCollected')).toBeDefined()
  })

  it('says refine_ready once, at its tick, whether the clock jumps there or steps tick by tick', () => {
    const readyTicksOf = (stepTicks: number) => {
      const { session, tick } = dockedAtRefineryWithOre()
      session.submit(tick + 1, queue(4))
      const end = tick + 1 + REFINE_TICKS + 120
      for (let at = tick + 1; at < end; at += stepTicks) session.advanceTo(at)
      session.advanceTo(end)
      return session
        .events()
        .filter((event) => event.type === 'RefineReady')
        .map((event) => event.tick - (tick + 1))
    }
    expect(readyTicksOf(REFINE_TICKS * 2)).toEqual([REFINE_TICKS])
    expect(readyTicksOf(1)).toEqual([REFINE_TICKS])
    expect(readyTicksOf(97)).toEqual([REFINE_TICKS])
  })

  it('pays floorMilli(n x V x 1.25) at the Sell bay and frees the slot', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    session.submit(tick + 1, queue(4))
    dockAtBayOf(session, tick + 1 + REFINE_TICKS, REFINERY_SITE, 'sell')
    const before = session.state().players.p1.wallet
    // Scripted mining lines its tiles (#115), and the payout settles that lining bill (#128).
    const bill = session.vehicle().liningBill
    const events = session.submit(tick + 2 + REFINE_TICKS, collect)
    expect(eventOf(events, 'RefineCollected')).toMatchObject({
      slot: 0,
      units: 4,
      value: toCanonical(refinedValue(TIER, 4)),
      waitSeconds: 180,
      queuedPlanet: 3,
    })
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(add(before, refinedValue(TIER, 4)), bill)),
    )
    expect(session.state().platform.refinerySlots).toEqual([null])
  })

  it('collects only at the Sell bay, never at the Refinery bay', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    session.submit(tick + 1, queue(4))
    expect(rejectionOf(session.submit(tick + 1 + REFINE_TICKS, collect))).toMatchObject({
      reason: 'wrong_bay',
    })
  })

  it('collects ready batches in the quick Sell, repair and recharge', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    session.submit(tick + 1, queue(4))
    dockAtBayOf(session, tick + 1 + REFINE_TICKS, REFINERY_SITE, 'sell')
    const events = session.submit(tick + 2 + REFINE_TICKS, { type: 'quickService', payload: {} })
    expect(eventOf(events, 'RefineCollected')).toMatchObject({ units: 4 })
    expect(session.state().platform.refinerySlots).toEqual([null])
  })

  it('keeps refining through travel, and pays the value locked at queue time', () => {
    const { session, tick } = dockedAtRefineryWithOre('1e30')
    session.submit(tick + 1, queue(4))
    session.submit(tick + 2, { type: 'debug.setCoreFragments', payload: { count: 100000 } })
    session.submit(tick + 3, { type: 'travel', payload: { toPlanet: 4 } })
    session.submit(tick + 1 + REFINE_TICKS, {
      type: 'debug.teleportToDock',
      payload: { bay: 'sell' },
    })
    expect(session.state().planet.index).toBe(4)
    const events = session.submit(tick + 2 + REFINE_TICKS, collect)
    expect(eventOf(events, 'RefineCollected')).toMatchObject({
      value: toCanonical(refinedValue(TIER, 4)),
      queuedPlanet: 3,
    })
  })

  it('round-trips a running batch through a snapshot', () => {
    const { session, tick } = dockedAtRefineryWithOre()
    session.submit(tick + 1, queue(4))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect(restored.problems).toEqual([])
    if (!('state' in restored)) return
    expect(restored.state.platform.refinerySlots).toEqual(session.state().platform.refinerySlots)
  })

  it('refuses a snapshot whose refinery slot is not a batch', () => {
    const { session } = dockedAtRefineryWithOre()
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    snapshot.state.platform.refinerySlots = [{ owner: 'p1', tier: 'seven' }]
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.state.platform.refinerySlots[0] must be null or a batch',
    ])
  })
})
