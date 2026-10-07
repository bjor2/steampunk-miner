import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { GROUND, poseAbove, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { toCanonical } from '../../../systems/money'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { chargesLeftOf } from './chargeState'
import { FAKE, FAKE_GATE, FAKE_REFUSAL, inField } from '../fakeItems'
import { intentToUseSlot } from './slotUse'

// Fake charged, channel, consumable and toggle items through `use_power_up` (#200 acceptance 1-3,
// #162 G&V E2 and E6 on a fake channel): each acts, is refused, and comes back as the dock says.

const press = (slot: 'powerup.1' | 'powerup.2' | 'powerup.3') => intentToUseSlot(slot)

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

const chargesOf = (session: ScriptedSession, itemId: string) =>
  chargesLeftOf(session.state(), 'p1', itemId)

function rejectionOf(session: ScriptedSession, tick: number, intent: CommandIntent) {
  const rejected = ofType(session.submit(tick, intent), 'CommandRejected')[0]
  return rejected?.type === 'CommandRejected' ? rejected.reason : null
}

describe('power-up use: charged', () => {
  it('winds up 6 ticks, then acts: its effect lands and one charge is spent', () => {
    inField((session) => {
      expect(session.submit(10, press('powerup.1'))).toEqual([])
      session.advanceTo(15)
      expect(walletOf(session)).toBe('0e+0')
      const events = session.advanceTo(20)
      expect(ofType(events, 'power-up-core.PowerUpUsed')).toEqual([
        {
          tick: 16,
          type: 'power-up-core.PowerUpUsed',
          playerId: 'p1',
          itemId: FAKE.charged,
          slot: 'powerup.1',
          mark: 0,
          originTx: GROUND.tx,
          originTy: GROUND.ty + 1,
          chargesLeft: 1,
        },
      ])
      expect(walletOf(session)).toBe('1e+0')
    })
  })

  it('acts on the same tick whether the clock jumps or steps one tick at a time', () => {
    const usedTicks = (stride: number) =>
      inField((session) => {
        session.submit(10, press('powerup.1'))
        const events: DomainEvent[] = []
        for (let tick = 10 + stride; tick <= 40; tick += stride)
          events.push(...session.advanceTo(tick))
        return ofType(events, 'power-up-core.PowerUpUsed').map((event) => event.tick)
      })
    expect(usedTicks(1)).toEqual([16])
    expect(usedTicks(30)).toEqual([16])
  })

  it('refuses, at no cost, a press while it cools down or once its charges are gone', () => {
    inField((session) => {
      session.submit(10, press('powerup.1'))
      session.advanceTo(16)
      expect(rejectionOf(session, 20, press('powerup.1'))).toBe('power-up-core.cooling_down')
      session.submit(46, press('powerup.1'))
      session.advanceTo(80)
      expect(chargesOf(session, FAKE.charged)).toBe(0)
      expect(rejectionOf(session, 90, press('powerup.1'))).toBe('power-up-core.no_charges')
      expect(walletOf(session)).toBe('2e+0')
    })
  })

  it('refuses a second press while the first still winds up', () => {
    inField((session) => {
      session.submit(10, press('powerup.1'))
      expect(rejectionOf(session, 12, press('powerup.2'))).toBe('power-up-core.busy')
    })
  })
})

describe('power-up use: refused by a gate (G&V E2)', () => {
  it('spends no charge, starts no cooldown and logs the gated cell', () => {
    inField(
      (session) => {
        session.submit(10, press('powerup.1'))
        const events = session.advanceTo(20)
        expect(ofType(events, 'power-up-core.PowerUpBlocked')).toEqual([
          {
            tick: 16,
            type: 'power-up-core.PowerUpBlocked',
            playerId: 'p1',
            itemId: FAKE.charged,
            slot: 'powerup.1',
            ...FAKE_GATE,
            tx: GROUND.tx,
            ty: GROUND.ty,
            chargesLeft: 2,
          },
        ])
        expect(chargesOf(session, FAKE.charged)).toBe(2)
        expect(walletOf(session)).toBe('0e+0')
        expect(rejectionOf(session, 20, press('powerup.1'))).toBeNull()
      },
      { facing: FACING.down },
    )
  })
})

describe('power-up use: refused with nothing to act on (ticket 204)', () => {
  it('spends no charge, starts no cooldown and logs why, naming no cell', () => {
    inField(
      (session) => {
        session.submit(10, press('powerup.1'))
        const events = session.advanceTo(20)
        expect(ofType(events, 'power-up-core.PowerUpBlocked')).toEqual([])
        expect(ofType(events, 'power-up-core.PowerUpRefused')).toEqual([
          {
            tick: 16,
            type: 'power-up-core.PowerUpRefused',
            playerId: 'p1',
            itemId: FAKE.charged,
            slot: 'powerup.1',
            reason: FAKE_REFUSAL,
            chargesLeft: 2,
          },
        ])
        expect(chargesOf(session, FAKE.charged)).toBe(2)
        expect(walletOf(session)).toBe('0e+0')
        expect(rejectionOf(session, 20, press('powerup.1'))).toBeNull()
      },
      { facing: FACING.up },
    )
  })
})

describe('power-up use: channel (G&V E6 on a fake)', () => {
  it('acts once the miner has held still for the whole channel', () => {
    inField((session) => {
      session.submit(10, press('powerup.2'))
      expect(chargesOf(session, FAKE.channel)).toBe(1)
      const events = session.advanceTo(100)
      expect(ofType(events, 'power-up-core.PowerUpUsed').map((event) => event.tick)).toEqual([70])
      expect(walletOf(session)).toBe('1e+0')
    })
  })

  it('refunds the charge and changes nothing when the miner moves before it ends', () => {
    const untouched = inField((session) => session.state().players.p1.slices)
    inField((session) => {
      session.submit(10, press('powerup.2'))
      const moved = poseAbove({ tx: GROUND.tx + 2, ty: GROUND.ty }, FACING.right, {
        driveTicks: 20,
      })
      session.submit(30, { ...moved, payload: { ...moved.payload, vx: 2000 } })
      const events = session.advanceTo(100)
      expect(ofType(events, 'power-up-core.ChannelCancelled')).toEqual([
        {
          tick: 31,
          type: 'power-up-core.ChannelCancelled',
          playerId: 'p1',
          itemId: FAKE.channel,
          slot: 'powerup.2',
          chargesLeft: 2,
        },
      ])
      expect(ofType(events, 'power-up-core.PowerUpUsed')).toEqual([])
      expect(walletOf(session)).toBe('0e+0')
      expect(session.state().players.p1.slices).toEqual(untouched)
    })
  })

  it('will not start while the miner is moving', () => {
    inField((session) => {
      const rolling = poseAbove(GROUND, FACING.right, { driveTicks: 4 })
      session.submit(5, { ...rolling, payload: { ...rolling.payload, vx: 2000 } })
      expect(rejectionOf(session, 10, press('powerup.2'))).toBe('power-up-core.not_still')
      expect(chargesOf(session, FAKE.channel)).toBe(2)
    })
  })
})

describe('power-up use: consumable and toggle', () => {
  it('spends one unit of a consumable stack per use', () => {
    inField(
      (session) => {
        session.submit(10, press('powerup.1'))
        session.advanceTo(14)
        session.submit(15, press('powerup.1'))
        session.advanceTo(30)
        expect(chargesOf(session, FAKE.consumable)).toBe(1)
        expect(walletOf(session)).toBe('2e+0')
      },
      { slots: { 'powerup.1': FAKE.consumable } },
    )
  })

  it('switches a toggle on through its activation and off with the next press', () => {
    inField(
      (session) => {
        const on = ofType(session.submit(10, press('powerup.1')), 'power-up-core.PowerUpUsed')
        expect(on).toMatchObject([{ itemId: FAKE.toggle, toggledOn: true, chargesLeft: 0 }])
        const off = ofType(session.submit(20, press('powerup.1')), 'power-up-core.PowerUpUsed')
        expect(off).toMatchObject([{ itemId: FAKE.toggle, toggledOn: false }])
        expect(walletOf(session)).toBe('1e+0')
      },
      { slots: { 'powerup.1': FAKE.toggle } },
    )
  })

  it('leaves a toggle off when a gate refuses it', () => {
    inField(
      (session) => {
        const events = session.submit(10, press('powerup.1'))
        expect(ofType(events, 'power-up-core.PowerUpBlocked')).toHaveLength(1)
        const again = ofType(session.submit(20, press('powerup.1')), 'power-up-core.PowerUpBlocked')
        expect(again).toHaveLength(1)
      },
      { slots: { 'powerup.1': FAKE.toggle }, facing: FACING.down },
    )
  })
})

describe('power-up use: what a slot press cannot use', () => {
  it('refuses an empty slot, a locked slot and an extractor, changing nothing', () => {
    inField(
      (session) => {
        expect(rejectionOf(session, 10, press('powerup.2'))).toBe('power-up-core.slot_empty')
        expect(rejectionOf(session, 11, press('powerup.3'))).toBe('power-up-core.slot_locked')
        expect(rejectionOf(session, 12, press('powerup.1'))).toBe('power-up-core.not_usable')
        expect(session.state().players.p1.slices).toBeUndefined()
      },
      { slots: { 'powerup.1': FAKE.extractor } },
    )
  })

  it('refuses a slot that is not a power-up slot', () => {
    inField((session) => {
      const intent = {
        type: 'power-up-core.use_power_up',
        payload: { slot: 'drill.head' },
      } as const
      expect(rejectionOf(session, 10, intent)).toBe('power-up-core.not_a_power_up_slot')
    })
  })
})
