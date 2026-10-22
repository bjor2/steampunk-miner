import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { effectiveTravelSpeedOf } from '../authority/travelSpeed'
import { vehicleOf } from '../authority/authorityState'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { createBotSession, type BotSession } from './botSession'
import { botTravelSpeedOf } from './botWorld'

// The bot travels at the rig's effective travel speed, since ticket 723 the drive's: the engine's
// top speed whatever the drill, with no clamp at the old fixed 18 m/s pose bound (#334 derives the
// bound from the rig's stats).

/** The bot at planet 1's Upgrade bay with the stored `levels`. */
function botWith(levels: Record<string, number>): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

const travelOf = (session: BotSession) => botTravelSpeedOf(session.state(), session.playerId)

describe('bot travel speed (tickets 333, 397, 723)', () => {
  it('drives at the engine top speed', () => {
    const session = botWith({})
    const engine = statsOfVehicle(vehicleOf(session.state(), 'p1')).engine
    expect(travelOf(session)).toBe(engine.speedMax)
  })

  it('drives at the engine top speed beside a drill far past it', () => {
    const session = botWith({ drill_power: 2000, drill_tip: 600 })
    const engine = statsOfVehicle(vehicleOf(session.state(), 'p1')).engine
    expect(travelOf(session)).toBe(engine.speedMax)
    expect(travelOf(session)).toBe(effectiveTravelSpeedOf(session.state(), 'p1'))
  })

  it('travels past the old 18 m/s pose bound with an engine that fast', () => {
    const session = botWith({ engine: 23 })
    expect(travelOf(session)).toBeGreaterThan(18)
  })
})
