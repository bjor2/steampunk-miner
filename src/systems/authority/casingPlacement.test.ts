import { describe, expect, it } from 'vitest'
import { casingLiningPrice } from '../economy/casingPrices'
import { add, fromCanonical, toCanonical, ZERO_MONEY, type Money } from '../money'
import { casingBandOfWall } from '../world/casingBand'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from '../world/sampleGrid'
import { currentCasingOfChunk, currentDensityOfChunk } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import {
  digTenMetresUntil,
  driveThrough,
  REPORT_TICKS,
  START,
  STEP_MM,
  stepsBetween,
} from './casingDigFixtures'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  type ScriptedSession,
} from './scriptedSession'

const placedOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CasingPlaced')

/** A 20 m dig to the right from START, then backing out 2.2 m past where it began. */
function digTwentyMetres(): { session: ScriptedSession; digEnd: number } {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 19900), REPORT_TICKS)
  driveThrough(session, dug, stepsBetween(START.x + 19900, START.x - 2200), 0)
  return { session, digEnd: dug }
}

function linedSamplesOf(session: ScriptedSession): { sx: number; sy: number }[] {
  const lined: { sx: number; sy: number }[] = []
  const y0 = Math.floor((START.y - 2000) / MM_PER_SAMPLE)
  const x0 = Math.floor((START.x - 2000) / MM_PER_SAMPLE)
  for (let sy = y0; sy < y0 + 16; sy++) {
    for (let sx = x0; sx < x0 + 100; sx++) {
      const casing = currentCasingOfChunk(
        session.state().world,
        chunkOfSample(sx),
        chunkOfSample(sy),
      )
      if (casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] > 0) lined.push({ sx, sy })
    }
  }
  return lined
}

function densityAt(session: ScriptedSession, sx: number, sy: number): number {
  const world = session.state().world
  const density = currentDensityOfChunk(world, PARAMS, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

describe('automatic casing placement', () => {
  it('lays one ring per half metre of a 20 m dig once the drill has passed each point', () => {
    const { session } = digTwentyMetres()
    const placed = placedOf(session.events())
    expect(placed).toHaveLength(40)
    expect(placed.every((event) => event.grade === 1)).toBe(true)
  })

  it('keeps the rings behind the drill while it digs, so it never re-drills fresh lining', () => {
    const { session, digEnd } = digTwentyMetres()
    const whileDigging = session.events().filter((event) => event.tick < digEnd)
    expect(placedOf(whileDigging).length).toBeGreaterThan(30)
    expect(whileDigging.filter((event) => event.type === 'CasingDrilled')).toEqual([])
  })

  it('lines the rock of the tunnel wall without narrowing the bore', () => {
    const { session } = digTwentyMetres()
    const lined = linedSamplesOf(session)
    expect(lined.length).toBeGreaterThan(0)
    expect(lined.every(({ sx, sy }) => densityAt(session, sx, sy) > 128)).toBe(true)
  })

  it('lays rings at the vehicle casing grade, unlimited and never refused', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, { type: 'debug.setCasingGrade', payload: { grade: 3 } })
    const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), REPORT_TICKS)
    driveThrough(session, dug, stepsBetween(START.x + 9900, START.x - 2200), 0)
    const placed = placedOf(session.events())
    expect(placed).toHaveLength(20)
    expect(placed.every((event) => event.grade === 3)).toBe(true)
  })

  it('relines the tunnel at the new grade when the vehicle drills back through it after an upgrade', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), REPORT_TICKS)
    const out = driveThrough(session, dug, stepsBetween(START.x + 9900, START.x - 2200), 0)
    session.submit(out, { type: 'debug.setCasingGrade', payload: { grade: 3 } })
    const before = session.events().length
    const back = driveThrough(
      session,
      out,
      stepsBetween(START.x - 2200, START.x + 9900),
      REPORT_TICKS,
    )
    driveThrough(session, back, stepsBetween(START.x + 9900, START.x - 2200), 0)
    const relaid = placedOf(session.events().slice(before))
    expect(relaid.every((event) => event.grade === 3)).toBe(true)
    expect(relaid.reduce((sum, event) => sum + event.relined, 0)).toBeGreaterThan(0)
  })

  it('replays the same dig to the same digest, and a snapshot keeps the trail', () => {
    const first = digTwentyMetres().session.state()
    const again = digTwentyMetres().session.state()
    expect(stateDigest(again)).toBe(stateDigest(first))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(first))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(first))
  })

  it('lays no ring from travel without drilling', () => {
    const session = createScriptedSession()
    driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), 0)
    driveThrough(session, 1500, stepsBetween(START.x + 9900, START.x - 2200), 0)
    expect(placedOf(session.events())).toEqual([])
    expect(session.vehicle().casingTrail.unlined).toEqual([])
  })
})

const linedOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CasingLined')

const HALF_METRE = fromCanonical('0.5')

function walletOf(session: ScriptedSession): Money {
  return session.state().players.p1.wallet
}

function billOf(session: ScriptedSession): Money {
  return session.vehicle().liningBill
}

function sumOfPrices(lined: readonly { price: string }[]): Money {
  return lined.map((event) => fromCanonical(event.price)).reduce(add, ZERO_MONEY)
}

/** A 10 m dig from START at `grade` with `money` in the wallet, backing out past where it began. */
function digTenMetres(grade: number, money: string): ScriptedSession {
  return digTenMetresUntil(grade, money).session
}

describe('first-place casing lining charge', () => {
  it('charges each half metre of new lining ceilMilli(k_casing * V(t(p,b)) * 0.5) at its wall band', () => {
    const session = digTenMetres(1, '1000')
    const lined = linedOf(session.events())
    const ringsOnNewRock = placedOf(session.events()).filter((event) => event.samples > 0)
    expect(lined).toHaveLength(ringsOnNewRock.length)
    for (const event of lined) {
      expect(event.lengthMm).toBe(500)
      expect(event.price).toBe(toCanonical(casingLiningPrice(1, event.band, HALF_METRE)))
    }
  })

  it('charges a 10 m bore for 10 m of lining whether its poses step every 0.5 m or every 1 m', () => {
    // Drilling as long per metre either way, so the bore is as open at both report spacings.
    const chargedLengthMmAt = (stepMm: number) => {
      const session = createScriptedSession()
      const ticks = (REPORT_TICKS * stepMm) / STEP_MM
      session.submit(0, FREEZE_ENEMIES)
      session.submit(0, { type: 'debug.setMoney', payload: { amount: '1000' } })
      const steps = stepsBetween(START.x, START.x + 10000, stepMm)
      const dug = driveThrough(session, 0, steps, ticks, ticks)
      driveThrough(session, dug, stepsBetween(START.x + 10000, START.x - 2200), 0)
      const lined = linedOf(session.events())
      return lined.reduce((sum, event) => sum + event.lengthMm, 0)
    }
    const atHalfMetre = chargedLengthMmAt(500)
    expect(chargedLengthMmAt(1000)).toBe(atHalfMetre)
    expect(Math.abs(atHalfMetre - 10000)).toBeLessThanOrEqual(500)
  })

  it('adds exactly the sum of the logged prices to the lining bill and takes nothing mid-dive', () => {
    const session = digTenMetres(1, '1000')
    const charged = sumOfPrices(linedOf(session.events()))
    expect(toCanonical(billOf(session))).toBe(toCanonical(charged))
    expect(toCanonical(charged)).not.toBe(toCanonical(ZERO_MONEY))
    expect(toCanonical(walletOf(session))).toBe(toCanonical(fromCanonical('1000')))
  })

  it('prices the band of the rock the ring lined', () => {
    const session = digTenMetres(1, '1000')
    const wallBand = casingBandOfWall(PARAMS, [
      { sx: START.x / MM_PER_SAMPLE, sy: (START.y - 700) / MM_PER_SAMPLE, weight: 256, floor: 0 },
    ])
    expect(linedOf(session.events()).every((event) => event.band === wallBand)).toBe(true)
  })

  it('charges the same metre price at grade 5 as at grade 1', () => {
    const pricesAt = (grade: number) =>
      linedOf(digTenMetres(grade, '1000').events()).map((event) => [event.band, event.price])
    expect(pricesAt(5)).toEqual(pricesAt(1))
  })

  it('charges nothing for rings that only reline the tunnel at a new grade on the way back', () => {
    const { session, end } = digTenMetresUntil(1, '1000')
    session.submit(end, { type: 'debug.setCasingGrade', payload: { grade: 3 } })
    const before = session.events().length
    const billBefore = billOf(session)
    const back = driveThrough(
      session,
      end,
      stepsBetween(START.x - 2200, START.x + 9400),
      REPORT_TICKS,
    )
    driveThrough(session, back, stepsBetween(START.x + 9400, START.x - 2200), 0)
    const after = session.events().slice(before)
    const relineOnly = placedOf(after).filter((event) => event.samples === 0 && event.relined > 0)
    const onNewRock = placedOf(after).filter((event) => event.samples > 0)
    expect(relineOnly.length).toBeGreaterThan(onNewRock.length)
    expect(linedOf(after)).toHaveLength(onNewRock.length)
    const charged = sumOfPrices(linedOf(after))
    expect(toCanonical(billOf(session))).toBe(toCanonical(add(billBefore, charged)))
  })

  it('lines and bills the tunnel the same with an empty wallet as with savings', () => {
    const broke = digTenMetres(1, '0')
    const saving = digTenMetres(1, '1000')
    expect(placedOf(broke.events())).toHaveLength(20)
    expect(linedOf(broke.events())).toEqual(linedOf(saving.events()))
    expect(toCanonical(billOf(broke))).toBe(toCanonical(billOf(saving)))
    expect(toCanonical(walletOf(broke))).toBe(toCanonical(ZERO_MONEY))
  })

  it('lays a debug lineCasing ring free', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setMoney', payload: { amount: '100' } })
    session.submit(0, {
      type: 'debug.carveCircle',
      payload: { x: START.x, y: START.y, radius: 950, amount: 255 },
    })
    session.submit(1, { type: 'debug.lineCasing', payload: { x: START.x, y: START.y, grade: 2 } })
    expect(placedOf(session.events())[0].samples).toBeGreaterThan(0)
    expect(linedOf(session.events())).toEqual([])
    expect(toCanonical(walletOf(session))).toBe(toCanonical(fromCanonical('100')))
  })
})
