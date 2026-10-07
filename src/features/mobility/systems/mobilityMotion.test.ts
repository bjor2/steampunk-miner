import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { ECONOMY } from '../../../systems/economy/economy'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { energyMaxQuantaOf } from '../../../systems/vehicle/vehicleState'
import {
  CAVITY,
  MM,
  ofType,
  poseAt,
  press,
  sessionWith,
  standInCavity,
} from '../mobilityTestSession'
import { MOBILITY_ITEM } from './itemIds'
import { ballastGainBp } from './mobilityMotion'
import { mobilityOf } from './mobilitySection'

// The mobility items on the kernel's motion seam (ticket 233), and the toggles' energy draw
// (#162 4.4: grav anchor 1.0%/s, buoyancy tanks 1.5%/s; switched off at an empty tank).

const motionOf = (session: ScriptedSession, tick: number) =>
  vehicleMotionAt(session.state(), 'p1', tick)

const drawPerTick = (session: ScriptedSession, perMille: number) =>
  Math.ceil((energyMaxQuantaOf(session.vehicle()) * perMille) / (1000 * TICKS_PER_SECOND))

describe('mobility motion: bursts and ballast', () => {
  it('lightens the miner for 300 ticks after the ballast drops, its lift and drive capped', () => {
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.emergencyBallast })
    session.submit(10, press())
    session.advanceTo(16)
    const cap = ECONOMY.itemEffectCaps.motionBoostCapBp
    expect(ballastGainBp()).toBe(6666)
    expect(motionOf(session, 16)).toMatchObject({ liftBoostBp: cap, driveBoostBp: cap })
    expect(motionOf(session, 315)).toMatchObject({ liftBoostBp: cap })
    expect(motionOf(session, 316)).toMatchObject({ liftBoostBp: 0, driveBoostBp: 0 })
  })

  it('bursts the steam boost toward the side faced for 30 ticks', () => {
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.steamBoost }, FACING.left)
    session.submit(10, press())
    session.advanceTo(16)
    const burst = motionOf(session, 20).burst!
    expect(burst.x).toBeLessThan(0)
    expect(burst.y).toBe(0)
    expect(motionOf(session, 46).burst).toBeNull()
  })

  it('burns the escape thruster up the shaft until the first solid cell above the miner', () => {
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.escapeThruster })
    standInCavity(session, 5, FACING.right)
    session.submit(10, press())
    session.advanceTo(16)
    expect(motionOf(session, 20).burst!.y).toBeGreaterThan(0)
    const underRoof = CAVITY.y + 2 * MM
    session.submit(40, poseAt(CAVITY.x, underRoof, FACING.right))
    expect(motionOf(session, 40).burst).toBeNull()
    session.advanceTo(41)
    expect(mobilityOf(session.state(), 'p1').escape).toBeNull()
  })
})

describe('mobility motion: toggles', () => {
  it('clings while the grav anchor is on in its slot, and drops to the fall rules once off', () => {
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.gravAnchor })
    expect(motionOf(session, 5).isClinging).toBe(false)
    session.submit(10, press())
    expect(motionOf(session, 10)).toMatchObject({ isClinging: true, isHovering: false })
    session.submit(20, press())
    expect(motionOf(session, 20).isClinging).toBe(false)
  })

  it('hovers while the buoyancy tanks are on', () => {
    const session = sessionWith({ 'powerup.2': MOBILITY_ITEM.buoyancyTanks })
    session.submit(10, press('powerup.2'))
    expect(motionOf(session, 10)).toMatchObject({ isHovering: true, isClinging: false })
  })

  it.each([
    [MOBILITY_ITEM.gravAnchor, 10],
    [MOBILITY_ITEM.buoyancyTanks, 15],
  ])('drains %s at %i thousandths of the tank a second while on', (itemId, perMille) => {
    const session = sessionWith({ 'powerup.1': itemId })
    session.submit(10, press())
    const full = session.vehicle().energy
    session.advanceTo(10 + TICKS_PER_SECOND)
    expect(full - session.vehicle().energy).toBe(TICKS_PER_SECOND * drawPerTick(session, perMille))
  })

  it('switches the toggle off at an empty tank, and its effect with it', () => {
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.buoyancyTanks })
    session.submit(10, press())
    session.submit(11, { type: 'debug.setEnergy', payload: { energy: '0.05' } })
    const events = session.advanceTo(40)
    expect(ofType(events, 'power-up-core.PowerUpUsed')).toMatchObject([
      { itemId: MOBILITY_ITEM.buoyancyTanks, toggledOn: false },
    ])
    expect(session.vehicle().energy).toBe(0)
    expect(motionOf(session, 40).isHovering).toBe(false)
  })
})
