import { describe, expect, it } from 'vitest'
import { casingLiningPrice } from '../economy/casingPrices'
import { ECONOMY } from '../economy/economy'
import { liningTypeUnlockPrice } from '../economy/heatEconomy'
import { oreTier, oreValue } from '../economy/oreEconomy'
import { add, ceilMilli, fromCanonical, mul, sub, toCanonical, ZERO_MONEY } from '../money'
import { FACING } from '../vehicle/vehiclePose'
import { casingTypeIndexOf } from '../world/chunkDelta'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from '../world/sampleGrid'
import { currentCasingOfChunk } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'

const buy = (liningType: string): CommandIntent => ({
  type: 'buyLiningType',
  payload: { liningType },
})
const select = (liningType: string): CommandIntent => ({
  type: 'selectLiningType',
  payload: { liningType },
})
const setLiningType = (liningType: string): CommandIntent => ({
  type: 'debug.setLiningType',
  payload: { liningType },
})

/** Docked at `bay` on planet `planetIndex` with `money` in the wallet. */
function dockedOn(planetIndex: number, bay: 'sell' | 'upgrade' = 'upgrade', money = '1e30') {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: money } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay } })
  return session
}

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')

describe('lining types at the Upgrade bay (#113)', () => {
  it('unlocks refractory on planet 8 for 40 band-5 ore units and makes it the active type', () => {
    const session = dockedOn(8)
    const before = session.state().players.p1.wallet
    const events = session.submit(1, buy('refractory'))
    const price = liningTypeUnlockPrice('refractory', 8)
    expect(events.map((event) => event.type)).toEqual(['LiningTypeUnlocked', 'LiningTypeSelected'])
    expect(events[0]).toMatchObject({ liningType: 'refractory', price: toCanonical(price) })
    expect(session.vehicle().lining).toEqual({
      active: 'refractory',
      owned: ['standard', 'refractory'],
    })
    expect(session.state().players.p1.wallet).toEqual(sub(before, price))
  })

  it('refuses refractory before planet 8, where refractory_lining is not open', () => {
    const session = dockedOn(7)
    expect(rejectionOf(session.submit(1, buy('refractory')))).toMatchObject({
      reason: 'feature_locked',
    })
    expect(session.vehicle().lining.owned).toEqual(['standard'])
  })

  it('sells the lining type at the Upgrade bay only', () => {
    expect(rejectionOf(dockedOn(8, 'sell').submit(1, buy('refractory')))).toMatchObject({
      reason: 'wrong_bay',
    })
  })

  it('refuses a second unlock, an unknown type and a wallet that cannot pay', () => {
    const owned = dockedOn(8)
    owned.submit(1, buy('refractory'))
    expect(rejectionOf(owned.submit(2, buy('refractory')))).toMatchObject({
      reason: 'lining_type_owned',
    })
    expect(rejectionOf(owned.submit(3, buy('asbestos')))).toMatchObject({
      reason: 'unknown_lining_type',
    })
    expect(rejectionOf(dockedOn(8, 'upgrade', '1').submit(1, buy('refractory')))).toMatchObject({
      reason: 'money_short',
    })
  })

  it('switches between owned types for free, and refuses a type not unlocked', () => {
    const session = dockedOn(8)
    expect(rejectionOf(session.submit(1, select('refractory')))).toMatchObject({
      reason: 'lining_type_not_owned',
    })
    session.submit(2, buy('refractory'))
    const wallet = session.state().players.p1.wallet
    expect(session.submit(3, select('standard'))).toMatchObject([
      { type: 'LiningTypeSelected', liningType: 'standard' },
    ])
    expect(session.vehicle().lining.active).toBe('standard')
    expect(session.state().players.p1.wallet).toEqual(wallet)
  })

  it('keeps the lining through a snapshot', () => {
    const session = dockedOn(8)
    session.submit(1, buy('refractory'))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && restored.state.players.p1.vehicle.lining.active).toBe(
      'refractory',
    )
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(session.state()))
  })
})

/** Rock 12 m under the surface east of the pad, where a sideways tunnel is cut. */
const START = { x: 20500, y: 280500 }
const REPORT_TICKS = 12
const STEP_MM = 100
const HALF_METRE = fromCanonical('0.5')

function poseAt(x: number, drillTicks: number) {
  const { payload } = poseAbove(GROUND, FACING.right)
  return {
    type: 'reportPose' as const,
    payload: { ...payload, x, y: START.y, drilling: drillTicks > 0, drillTicks },
  }
}

/** Drives along `xs` one report apart, drilling or not, refilling the tank each report. */
function driveThrough(session: ScriptedSession, firstTick: number, xs: number[], drillTicks = 0) {
  xs.forEach((x, index) => {
    const tick = firstTick + index * REPORT_TICKS
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, poseAt(x, drillTicks))
  })
  return firstTick + xs.length * REPORT_TICKS
}

function stepsBetween(fromMm: number, toMm: number): number[] {
  const count = Math.floor(Math.abs(toMm - fromMm) / STEP_MM) + 1
  const direction = toMm >= fromMm ? 1 : -1
  return Array.from({ length: count }, (_, index) => fromMm + direction * index * STEP_MM)
}

/** A 10 m bore to the right in `liningType`, backing out past where it began; returns the tick. */
function boreTenMetres(session: ScriptedSession, liningType: string): number {
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e9' } })
  session.submit(0, setLiningType(liningType))
  const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), REPORT_TICKS)
  return driveThrough(session, dug, stepsBetween(START.x + 9900, START.x - 2200))
}

/** Drills back along the bore and out again, as relining the tunnel does. */
function drillBackThrough(session: ScriptedSession, tick: number): DomainEvent[] {
  const before = session.events().length
  const back = driveThrough(
    session,
    tick,
    stepsBetween(START.x - 2200, START.x + 9400),
    REPORT_TICKS,
  )
  driveThrough(session, back, stepsBetween(START.x + 9400, START.x - 2200))
  return session.events().slice(before)
}

const linedOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'CasingLined' ? [event] : []))

/** The lining type indexes found in the wall above the bore. */
function wallTypeIndexes(session: ScriptedSession): Set<number | null> {
  const found = new Set<number | null>()
  const sy = Math.floor((START.y + 1000) / MM_PER_SAMPLE)
  for (let sx = START.x / MM_PER_SAMPLE; sx < (START.x + 9000) / MM_PER_SAMPLE; sx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const world = session.state().world
      const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy + dy))
      const value = casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy + dy))]
      if (value > 0) found.add(casingTypeIndexOf(value))
    }
  }
  return found
}

describe('refractory lining laid by the drill (#113 numbers acceptance 3)', () => {
  it('charges each half metre 1.5 times k_casing * V(t(p,b)), logged as refractory', () => {
    const session = createScriptedSession()
    boreTenMetres(session, 'refractory')
    const lined = linedOf(session.events())
    expect(lined.length).toBeGreaterThan(0)
    for (const event of lined) {
      const metre = mul(ECONOMY.casing.kCasing, oreValue(oreTier(1, event.band)))
      const expected = ceilMilli(mul(mul(metre, fromCanonical('1.5')), HALF_METRE))
      expect(event).toMatchObject({ liningType: 'refractory', price: toCanonical(expected) })
      expect(event.price).toBe(
        toCanonical(casingLiningPrice(1, event.band, HALF_METRE, 'refractory')),
      )
    }
    expect(wallTypeIndexes(session)).toEqual(new Set([1]))
  })

  it('charges relaying a standard tunnel in refractory as first placement of refractory', () => {
    const session = createScriptedSession()
    const out = boreTenMetres(session, 'standard')
    session.submit(out, setLiningType('refractory'))
    const relaid = linedOf(drillBackThrough(session, out))
    expect(relaid.length).toBeGreaterThan(10)
    expect(relaid.every((event) => event.liningType === 'refractory')).toBe(true)
    expect(relaid.every((event) => event.price !== toCanonical(ZERO_MONEY))).toBe(true)
    expect(wallTypeIndexes(session)).toEqual(new Set([1]))
  })

  it('relines a refractory tunnel in refractory for nothing', () => {
    const session = createScriptedSession()
    const out = boreTenMetres(session, 'refractory')
    // Lining is billed, not debited mid-dive (#115): the bill grows by exactly what was charged.
    const bill = session.state().players.p1.vehicle.liningBill
    const again = drillBackThrough(session, out)
    const charged = linedOf(again)
      .map((event) => fromCanonical(event.price))
      .reduce(add, ZERO_MONEY)
    const onNewRock = again.filter((event) => event.type === 'CasingPlaced' && event.samples > 0)
    expect(linedOf(again)).toHaveLength(onNewRock.length)
    expect(session.state().players.p1.vehicle.liningBill).toEqual(add(bill, charged))
  })
})
