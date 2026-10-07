import { describe, expect, it } from 'vitest'
import { ENERGY_QUANTA_PER_UNIT } from '../../../constants/balance'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { energyMaxQuantaOf } from '../../../systems/vehicle/vehicleState'
import { FAKE, FAKE_DRAW_BP, inField } from '../fakeItems'
import { isToggledOn, powerUpStateOf } from './chargeState'
import { intentToUseSlot } from './slotUse'
import { tickDrawOf, toggleDrawQuantaOf } from './toggleDraw'

// A toggle's energy draw (#162 section 4.4, the GD lock on #204 Q3 a, ticket 233): a share of
// energyMax a second while on, an empty tank strands the vehicle as thrust does, and switches
// the toggle off.

const press = intentToUseSlot('powerup.1')
const ON_TICK = 10

const setEnergy = (units: string): CommandIntent => ({
  type: 'debug.setEnergy',
  payload: { energy: units },
})

const energyOf = (session: ScriptedSession) => session.vehicle().energy

/** The fake's draw a tick: 150 bp of the level-0 tank a second, 9 quanta at 60 ticks a second. */
const drawPerTick = (session: ScriptedSession) =>
  (energyMaxQuantaOf(session.vehicle()) * FAKE_DRAW_BP) / 600_000

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

function withDrawingToggleOn<T>(body: (session: ScriptedSession) => T): T {
  return inField(
    (session) => {
      session.submit(ON_TICK, press)
      return body(session)
    },
    { slots: { 'powerup.1': FAKE.drawingToggle, 'powerup.2': FAKE.toggle } },
  )
}

describe('toggle energy draw', () => {
  it('takes 1.5% of energyMax a second while the drawing toggle is on', () => {
    withDrawingToggleOn((session) => {
      const full = energyOf(session)
      session.advanceTo(ON_TICK + 60)
      expect(drawPerTick(session)).toBe(9)
      expect(full - energyOf(session)).toBe(60 * 9)
    })
  })

  it('names the quanta the next draw takes, and none once the toggle is off', () => {
    withDrawingToggleOn((session) => {
      expect(toggleDrawQuantaOf(session.state(), 'p1')).toBe(drawPerTick(session))
      const before = energyOf(session)
      session.advanceTo(ON_TICK + 1)
      expect(before - energyOf(session)).toBe(toggleDrawQuantaOf(session.state(), 'p1'))
      session.submit(ON_TICK + 1, press)
      expect(toggleDrawQuantaOf(session.state(), 'p1')).toBe(0)
    })
  })

  it('stops drawing once the toggle is switched off, and a toggle that draws nothing never draws', () => {
    withDrawingToggleOn((session) => {
      session.submit(ON_TICK + 30, press)
      const afterOff = energyOf(session)
      session.submit(ON_TICK + 31, intentToUseSlot('powerup.2'))
      session.advanceTo(ON_TICK + 300)
      expect(energyOf(session)).toBe(afterOff)
    })
  })

  it('switches the toggle off at an empty tank and strands the vehicle, as thrust would', () => {
    withDrawingToggleOn((session) => {
      session.submit(ON_TICK + 1, setEnergy('0.1'))
      expect(energyOf(session)).toBe(ENERGY_QUANTA_PER_UNIT / 10)
      const events = session.advanceTo(ON_TICK + 10)
      expect(energyOf(session)).toBe(0)
      expect(isToggledOn(powerUpStateOf(session.state(), 'p1'), FAKE.drawingToggle)).toBe(false)
      expect(ofType(events, 'power-up-core.PowerUpUsed')).toMatchObject([
        { tick: ON_TICK + 4, itemId: FAKE.drawingToggle, toggledOn: false, chargesLeft: 0 },
      ])
      expect(ofType(events, 'EnergyDepleted')).toMatchObject([{ tick: ON_TICK + 4 }])
      expect(session.vehicle().mode).toBe('stranded')
    })
  })

  it('writes no remainder into the section while a tick draws whole quanta, so the digest keeps', () => {
    withDrawingToggleOn((session) => {
      session.advanceTo(ON_TICK + 600)
      expect(powerUpStateOf(session.state(), 'p1')).not.toHaveProperty('drawRemainder')
    })
  })

  it('drains the same stepping one tick at a time or jumping the clock', () => {
    const energyAfter = (stride: number) =>
      withDrawingToggleOn((session) => {
        for (let tick = ON_TICK + stride; tick <= ON_TICK + 120; tick += stride) {
          session.advanceTo(tick)
        }
        return { energy: energyOf(session), events: session.events() }
      })
    expect(energyAfter(1)).toEqual(energyAfter(120))
  })
})

describe('toggle draw in basis points', () => {
  /** 10 000 bp of energyMax a second at 60 ticks a second: a tick owes energyMax x bp / 600 000. */
  const PARTS_PER_QUANTUM = 600_000

  const drawnOver = (ticks: number, energyMaxQuanta: number, drawBp: number) => {
    let draw = { quanta: 0, remainder: 0 }
    let total = 0
    for (let tick = 0; tick < ticks; tick += 1) {
      draw = tickDrawOf(energyMaxQuanta, drawBp, draw.remainder)
      total += draw.quanta
    }
    return { total, remainder: draw.remainder }
  }

  it('takes whole quanta a tick and carries the fraction, never rounding a tick up', () => {
    // #205's auger at 30 bp/s on the level-0 tank owes 1.8 quanta a tick.
    expect(tickDrawOf(36_000, 30, 0)).toEqual({ quanta: 1, remainder: 480_000 })
    expect(tickDrawOf(36_000, 30, 480_000)).toEqual({ quanta: 2, remainder: 360_000 })
  })

  it('draws exactly the rate times the span over 600 s, at a sub-per-mille rate', () => {
    expect(drawnOver(600 * 60, 36_000, 30)).toEqual({
      total: (36_000 * 30 * 600) / 10_000,
      remainder: 0,
    })
  })

  it('loses no part of a quantum on a tank whose rate is no whole number a tick', () => {
    const owed = 37_440 * 85 * 600 * 60
    const drawn = drawnOver(600 * 60, 37_440, 85)
    expect(drawn.total * PARTS_PER_QUANTUM + drawn.remainder).toBe(owed)
  })
})
