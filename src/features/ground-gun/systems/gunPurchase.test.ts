import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { add, sub, toCanonical } from '../../../systems/money'
import { gunLevelsOf, UNMOUNTED_GUN } from './gunLevels'
import { BUY_LEVEL_COMMAND, mountPrice, MOUNT_COMMAND, nextLevelPrice } from './gunPurchase'
import { trackLevelPrice, wallLevelOf } from './gunTracks'

const mount: CommandIntent = { type: MOUNT_COMMAND, payload: {} }
const buyLevel = (track: string): CommandIntent => ({
  type: BUY_LEVEL_COMMAND,
  payload: { track },
})
const teleportToDock = (bay: 'sell' | 'upgrade'): CommandIntent => ({
  type: 'debug.teleportToDock',
  payload: { bay },
})
const grantMoney = (amount: string): CommandIntent => ({
  type: 'debug.grantMoney',
  payload: { amount },
})

/** Docked at `bay` on planet 1 with `money`. */
function dockedWith(money: string, bay: 'sell' | 'upgrade' = 'upgrade'): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, grantMoney(money))
  session.submit(0, teleportToDock(bay))
  return session
}

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')

describe('ground-gun: buying the gun and its tracks', () => {
  it('mounts the gun at the sum of the three level-1 prices, every track at level 1', () => {
    const session = dockedWith('1e6')
    const before = session.state().players.p1.wallet
    const events = session.submit(1, mount)
    expect(events[0]).toMatchObject({
      type: 'ground-gun.GunMounted',
      price: toCanonical(mountPrice()),
    })
    expect(gunLevelsOf(session.state(), 'p1')).toEqual({ rate: 1, penetration: 1, energy: 1 })
    expect(session.state().players.p1.wallet).toEqual(sub(before, mountPrice()))
  })

  it('prices the mount as one band-5 unit of P1 ore per track, about 152 in all', () => {
    const levelOne = trackLevelPrice('rate', 1)
    expect(mountPrice()).toEqual(add(add(levelOne, levelOne), levelOne))
    expect(Number(toCanonical(mountPrice()))).toBeGreaterThan(150)
    expect(Number(toCanonical(mountPrice()))).toBeLessThan(155)
  })

  it('raises one track a level per buy, debiting exactly the card price', () => {
    const session = dockedWith('1e6')
    session.submit(1, mount)
    const before = session.state().players.p1.wallet
    const price = nextLevelPrice(gunLevelsOf(session.state(), 'p1'), 'penetration')
    const events = session.submit(2, buyLevel('penetration'))
    expect(events[0]).toMatchObject({
      type: 'ground-gun.TrackLevelBought',
      track: 'penetration',
      from: 1,
      to: 2,
      price: toCanonical(trackLevelPrice('penetration', 2)),
    })
    expect(price).toEqual(trackLevelPrice('penetration', 2))
    expect(session.state().players.p1.wallet).toEqual(
      sub(before, trackLevelPrice('penetration', 2)),
    )
    expect(gunLevelsOf(session.state(), 'p1')).toEqual({ rate: 1, penetration: 2, energy: 1 })
  })

  it('answers each buy with the wallet change', () => {
    const session = dockedWith('1e6')
    const before = session.state().players.p1.wallet
    const events = session.submit(1, mount)
    expect(events[1]).toMatchObject({
      type: 'MoneyChanged',
      from: toCanonical(before),
      to: toCanonical(sub(before, mountPrice())),
    })
  })

  it('refuses a track level before the mount, changing nothing', () => {
    const session = dockedWith('1e6')
    const digest = stateDigest(session.state())
    expect(rejectionOf(session.submit(1, buyLevel('rate')))).toMatchObject({
      reason: 'ground-gun.gun_not_mounted',
    })
    expect(stateDigest(session.state())).toBe(digest)
  })

  it('refuses a second mount', () => {
    const session = dockedWith('1e6')
    session.submit(1, mount)
    expect(rejectionOf(session.submit(2, mount))).toMatchObject({
      reason: 'ground-gun.gun_mounted',
    })
  })

  it('refuses a track it does not know', () => {
    const session = dockedWith('1e6')
    session.submit(1, mount)
    expect(rejectionOf(session.submit(2, buyLevel('range')))).toMatchObject({
      reason: 'ground-gun.unknown_track',
    })
  })

  it('never sells a track past its wall', () => {
    const session = dockedWith('1e40')
    session.submit(1, mount)
    for (let level = 1; level < wallLevelOf('rate'); level++) session.submit(2, buyLevel('rate'))
    expect(gunLevelsOf(session.state(), 'p1').rate).toBe(wallLevelOf('rate'))
    expect(rejectionOf(session.submit(3, buyLevel('rate')))).toMatchObject({ reason: 'max_level' })
    expect(nextLevelPrice(gunLevelsOf(session.state(), 'p1'), 'rate')).toBeNull()
  })

  it('sells at the Upgrade bay only', () => {
    expect(rejectionOf(dockedWith('1e6', 'sell').submit(1, mount))).toMatchObject({
      reason: 'wrong_bay',
    })
  })

  it('refuses a mount the wallet cannot pay, changing nothing', () => {
    const session = dockedWith('10')
    expect(rejectionOf(session.submit(1, mount))).toMatchObject({ reason: 'money_short' })
    expect(gunLevelsOf(session.state(), 'p1')).toEqual(UNMOUNTED_GUN)
  })
})
