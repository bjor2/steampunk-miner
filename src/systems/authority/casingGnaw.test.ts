import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { blockContaining, blockIdOf } from '../world/collapseBlock'
import { BAND_1_Y, digAlong, poseAt, prepareDigger } from './collapse/collapseFixtures'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, type ScriptedSession } from './scriptedSession'

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

/** A band-1 tunnel 24 m long, dug and lined at grade 1 from the east of the pad. */
const DIG_FROM_X = 20500
const DIG_TO_X = 44500
/** The stretch a wrecker would leave: 2 m of rings, 20 m behind the tunnel's end. */
const GNAWED_XS = [23500, 24000, 24500, 25000, 25500]
const GNAWED_BLOCK = blockIdOf(blockContaining({ xMm: 24500, yMm: BAND_1_Y }))

const gnawAt = (x: number) => ({ type: 'debug.gnawCasing', payload: { x, y: BAND_1_Y } }) as const

/** Dug and lined at grade 1 with money in the wallet; answers the next free tick. */
function linedBandOneTunnel(): { session: ScriptedSession; tick: number } {
  const session = createScriptedSession()
  prepareDigger(session, 0)
  session.submit(0, { type: 'debug.grantMoney', payload: { amount: '1000' } })
  return { session, tick: digAlong(session, 1, BAND_1_Y, DIG_FROM_X, DIG_TO_X) }
}

/** Drives (no drill) from `fromX` to `toX`, 0.5 m a tick; answers the next free tick. */
function driveBack(session: ScriptedSession, tick: number, fromX: number, toX: number): number {
  let at = tick
  for (let x = fromX; x >= toX; x -= 500) session.submit(at++, poseAt(x, BAND_1_Y, 0, FACING.left))
  return at
}

/** Drills back west through the tunnel, 0.5 m a tick, so its rings fall due behind it. */
function drillBack(session: ScriptedSession, tick: number, fromX: number, toX: number): number {
  let at = tick
  for (let x = fromX; x >= toX; x -= 500) {
    session.submit(at, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(at++, poseAt(x, BAND_1_Y, 1, FACING.left))
  }
  return at
}

describe('breached casing in play (#94 acceptance 5 and 9)', () => {
  it('breaches a stretch and says so per chunk and per ring, with no warning while no vehicle is near', () => {
    const { session, tick } = linedBandOneTunnel()
    const events = GNAWED_XS.flatMap((x) => session.submit(tick, gnawAt(x)))
    expect(ofType(events, 'RingGnawed')).toHaveLength(GNAWED_XS.length)
    expect(ofType(events, 'RingGnawed').every(({ band }) => band === 1)).toBe(true)
    expect(ofType(events, 'CasingBreached').every(({ enemyId }) => enemyId === null)).toBe(true)
    expect(ofType(events, 'CollapseWarned')).toEqual([])
  })

  it('warns on the breached band-1 block once the vehicle comes within 16 m', () => {
    const { session, tick } = linedBandOneTunnel()
    GNAWED_XS.forEach((x) => session.submit(tick, gnawAt(x)))
    const before = session.events().length
    driveBack(session, tick + 1, DIG_TO_X, 34000)
    const warned = ofType(session.events().slice(before), 'CollapseWarned')
    expect(warned.map(({ block }) => block)).toContain(GNAWED_BLOCK)
    expect(warned.find(({ block }) => block === GNAWED_BLOCK)).toMatchObject({
      band: 1,
      weakestGrade: 0,
      required: 1,
    })
  })

  it('cancels the warning when the drill relines the stretch, and charges nothing for it', () => {
    const { session, tick } = linedBandOneTunnel()
    GNAWED_XS.forEach((x) => session.submit(tick, gnawAt(x)))
    const near = driveBack(session, tick + 1, DIG_TO_X, 34000)
    const walletBefore = session.state().players.p1.wallet
    const before = session.events().length
    drillBack(session, near, 33500, DIG_FROM_X)
    const relining = session.events().slice(before)
    expect(ofType(relining, 'CollapseCancelled').map(({ block }) => block)).toContain(GNAWED_BLOCK)
    expect(ofType(relining, 'CollapseStarted')).toEqual([])
    expect(ofType(relining, 'CasingPlaced').some(({ relined }) => relined > 0)).toBe(true)
    expect(ofType(relining, 'CasingLined')).toEqual([])
    expect(session.state().players.p1.wallet).toEqual(walletBefore)
  })

  it('charges the first lining again where a collapse refilled a breached stretch', () => {
    const { session, tick } = linedBandOneTunnel()
    GNAWED_XS.forEach((x) => session.submit(tick, gnawAt(x)))
    const near = driveBack(session, tick + 1, DIG_TO_X, 34000)
    session.advanceTo(near + 120)
    expect(ofType(session.events(), 'CollapseStarted').map(({ block }) => block)).toContain(
      GNAWED_BLOCK,
    )
    const before = session.events().length
    digAlong(session, near + 121, BAND_1_Y, 34000, DIG_FROM_X)
    expect(ofType(session.events().slice(before), 'CasingLined').length).toBeGreaterThan(0)
  })
})
