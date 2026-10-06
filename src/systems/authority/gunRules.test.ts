import { describe, expect, it } from 'vitest'
import { gunMaxLevel, gunMountPrice, gunLevelPrice } from '../economy/gunStats'
import { sub, toCanonical } from '../money'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, type ScriptedSession } from './scriptedSession'

const buyGun: CommandIntent = { type: 'buyGun', payload: {} }
const setGunMode = (mode: string): CommandIntent => ({ type: 'setGunMode', payload: { mode } })
const setGunLevel = (level: number): CommandIntent => ({
  type: 'debug.setGunLevel',
  payload: { level },
})
const setPlanet = (planetIndex: number): CommandIntent => ({
  type: 'debug.setPlanet',
  payload: { planetIndex },
})
const teleportToDock = (bay: 'sell' | 'upgrade'): CommandIntent => ({
  type: 'debug.teleportToDock',
  payload: { bay },
})
const grantMoney = (amount: string): CommandIntent => ({
  type: 'debug.grantMoney',
  payload: { amount },
})

/** Docked at `bay` on planet `planetIndex` with plenty of money. */
function dockedOn(planetIndex: number, bay: 'sell' | 'upgrade' = 'upgrade'): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setPlanet(planetIndex))
  session.submit(0, grantMoney('1e30'))
  session.submit(0, teleportToDock(bay))
  return session
}

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')

describe('guns: buying (#107)', () => {
  it('mounts the guns at level 1 on planet 4 for 30 band-5 ore units, logged as gun_mounted', () => {
    const session = dockedOn(4)
    const before = session.state().players.p1.wallet
    const events = session.submit(1, buyGun)
    expect(events[0]).toMatchObject({
      type: 'GunMounted',
      level: 1,
      price: toCanonical(gunMountPrice(4)),
    })
    expect(session.vehicle().gun).toEqual({ level: 1, mode: 'auto' })
    expect(session.state().players.p1.wallet).toEqual(sub(before, gunMountPrice(4)))
  })

  it('raises the gun track one level a buy once mounted, logged as gun_upgraded', () => {
    const session = dockedOn(5)
    session.submit(1, buyGun)
    const events = session.submit(2, buyGun)
    expect(events[0]).toMatchObject({
      type: 'GunUpgraded',
      from: 1,
      to: 2,
      price: toCanonical(gunLevelPrice(1, 5)),
    })
    expect(session.vehicle().gun.level).toBe(2)
  })

  it('refuses the guns before planet 4, where auto_guns is not unlocked yet', () => {
    const session = dockedOn(3)
    expect(rejectionOf(session.submit(1, buyGun))).toMatchObject({ reason: 'feature_locked' })
    expect(session.vehicle().gun.level).toBe(0)
  })

  it('sells the guns at the Upgrade bay only', () => {
    expect(rejectionOf(dockedOn(4, 'sell').submit(1, buyGun))).toMatchObject({
      reason: 'wrong_bay',
    })
  })

  it('refuses a buy the wallet cannot pay, changing nothing', () => {
    const session = createScriptedSession()
    session.submit(0, setPlanet(4))
    session.submit(0, teleportToDock('upgrade'))
    expect(rejectionOf(session.submit(1, buyGun))).toMatchObject({ reason: 'money_short' })
    expect(session.vehicle().gun.level).toBe(0)
  })

  it('stops at the top level of the gun track', () => {
    const session = dockedOn(4)
    session.submit(1, setGunLevel(gunMaxLevel()))
    expect(rejectionOf(session.submit(2, buyGun))).toMatchObject({ reason: 'max_level' })
  })

  it('leaves the visual tier alone: the guns are not a vehicle track', () => {
    const session = dockedOn(4)
    const events = session.submit(1, buyGun)
    expect(events.map((event) => event.type)).not.toContain('VehicleConfigurationChanged')
  })
})

describe('guns: the HUD toggle (#107)', () => {
  it('switches mounted guns off and back to auto, logging gun_mode each time', () => {
    const session = dockedOn(4)
    session.submit(1, buyGun)
    expect(session.submit(2, setGunMode('off'))[0]).toMatchObject({
      type: 'GunModeChanged',
      mode: 'off',
    })
    expect(session.vehicle().gun.mode).toBe('off')
    session.submit(3, setGunMode('auto'))
    expect(session.vehicle().gun.mode).toBe('auto')
  })

  it('refuses a switch with no guns, or to a mode that is not auto or off', () => {
    const session = dockedOn(4)
    expect(rejectionOf(session.submit(1, setGunMode('off')))).toMatchObject({ reason: 'no_guns' })
    session.submit(2, buyGun)
    expect(rejectionOf(session.submit(3, setGunMode('burst')))).toMatchObject({
      reason: 'unknown_mode',
    })
  })
})

describe('guns: debug level (#107 combat scenarios)', () => {
  it('sets any level from 0 to the cap with no unlock or price, and refuses one above it', () => {
    const session = createScriptedSession()
    session.submit(0, setGunLevel(3))
    expect(session.vehicle().gun.level).toBe(3)
    expect(rejectionOf(session.submit(1, setGunLevel(gunMaxLevel() + 1)))).toMatchObject({
      reason: 'out_of_range',
    })
  })
})
