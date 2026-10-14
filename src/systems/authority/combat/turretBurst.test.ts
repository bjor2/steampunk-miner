import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { enemyTier } from '../../economy/enemyStats'
import { gunShotsPerSecond } from '../../economy/gunStats'
import { stepOfMajor } from '../../economy/upgradeSteps'
import { hullMax, onCurveLevel } from '../../economy/vehicleStats'
import { toCanonical } from '../../money'
import type { TurretBurst, TurretShape } from '../../registries/autoGuns'
import { FACING } from '../../vehicle/vehiclePose'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import {
  CORRIDOR_MIDDLE,
  freezeEnemies,
  poseAt,
  prepareCorridor,
  setHull,
  setUpgrade,
  spawnEnemy,
} from './combatFixtures'
import { BASE_TURRET_SHAPE } from './turretShape'

/** Planet 4's on-curve rig, as `turretFire.test.ts` stages it, against a planet-40 brute. */
const PLANET = 4
const DRILL_LEVEL = onCurveLevel('drill_power', PLANET)
const HULL_LEVEL = onCurveLevel('hull', PLANET)
const TOUGH_TIER = enemyTier(40, 5)
const REPORT_TICKS = 12
const MINUTE_TICKS = 60 * TICKS_PER_SECOND

/** Content's Overpressure on #319: 120 ticks at two thirds of the interval, then a 300-tick vent. */
const OVERPRESSURE: TurretBurst = {
  burstTicks: 120,
  ventTicks: 300,
  intervalNumerator: 2,
  intervalDenominator: 3,
}
/** The fastest burst the kernel takes: its cycle fires exactly the track's shots. */
const EVEN_BURST: TurretBurst = { ...OVERPRESSURE, ventTicks: 60 }

const burst = (on: boolean): CommandIntent => ({ type: 'turret.burst', payload: { on } })
const setGunLevel = (level: number): CommandIntent => ({
  type: 'debug.setGunLevel',
  payload: { level: stepOfMajor(level) },
})
const setEnergy = (energy: string): CommandIntent => ({
  type: 'debug.setEnergy',
  payload: { energy },
})

function burstProbe(turretBurst: TurretBurst | null): SliceDefinition {
  const shape: TurretShape = { ...BASE_TURRET_SHAPE, burst: turretBurst }
  return {
    id: 'probe',
    register(r) {
      r.autoGuns({ id: 'probe.auto-guns', turretShapeOf: () => shape })
    },
  }
}

/** The corridor with the planet 4 rig and level-1 guns facing a frozen brute; the start tick. */
function standoff(session: ScriptedSession): number {
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setUpgrade('drill_power', DRILL_LEVEL))
  session.submit(start, setUpgrade('hull', HULL_LEVEL))
  session.submit(start, setHull(toCanonical(hullMax(HULL_LEVEL))))
  session.submit(start, setGunLevel(1))
  session.submit(start, freezeEnemies(true))
  session.submit(start, spawnEnemy('crawler', TOUGH_TIER, -3, 0))
  return start
}

/** Still pose reports to `to`, the tank topped up each second so steam never holds the guns. */
function standUntil(session: ScriptedSession, from: number, to: number) {
  for (let tick = from + REPORT_TICKS; tick <= to; tick += REPORT_TICKS) {
    if (tick % TICKS_PER_SECOND === 0) session.submit(tick, setEnergy('40'))
    session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
  }
  session.advanceTo(to)
}

function shotsIn(events: readonly DomainEvent[]): number {
  return events.reduce((total, event) => total + (event.type === 'GunHit' ? event.shots : 0), 0)
}

/** Shots in the minute's ticks from the start, the end left out, with the toggle on from the start. */
function shotsInMinute(turretBurst: TurretBurst | null, isToggled: boolean): number {
  return withRegistrations([burstProbe(turretBurst)], () => {
    const session = createScriptedSession()
    const start = standoff(session)
    if (isToggled) session.submit(start, burst(true))
    standUntil(session, start, start + MINUTE_TICKS - 1)
    expect(session.state().combat.enemies).toHaveLength(1)
    return shotsIn(session.events())
  })
}

function rejectionOf(events: readonly DomainEvent[]) {
  return events.find((event) => event.type === 'CommandRejected')
}

describe('turret burst: the toggle (ticket 383)', () => {
  it('is refused with no guns, and with no burst on the shape', () => {
    withRegistrations([burstProbe(OVERPRESSURE)], () => {
      const session = createScriptedSession()
      const start = prepareCorridor(session, FACING.right)
      expect(rejectionOf(session.submit(start, burst(true)))).toMatchObject({ reason: 'no_guns' })
    })
    withRegistrations([burstProbe(null)], () => {
      const session = createScriptedSession()
      const start = standoff(session)
      expect(rejectionOf(session.submit(start, burst(true)))).toMatchObject({ reason: 'no_burst' })
      expect(session.vehicle().gunBurst).toBeUndefined()
    })
  })

  it('answers TurretBurstSet on a real switch only, and keeps the shape cycle on the vehicle', () => {
    withRegistrations([burstProbe(OVERPRESSURE)], () => {
      const session = createScriptedSession()
      const start = standoff(session)
      expect(session.submit(start, burst(false))).toEqual([])
      expect(session.submit(start, burst(true))).toMatchObject([
        { type: 'TurretBurstSet', isOn: true },
      ])
      expect(session.submit(start + 1, burst(true))).toEqual([])
      expect(session.vehicle().gunBurst).toEqual({
        onSinceTick: start,
        ventUntilTick: start,
        cycle: OVERPRESSURE,
      })
      expect(session.submit(start + 2, burst(false))).toMatchObject([
        { type: 'TurretBurstSet', isOn: false },
      ])
      expect(session.vehicle().gunBurst?.onSinceTick).toBeNull()
    })
  })

  it('round-trips the toggle and its vent through the snapshot, and the digest sees them', () => {
    withRegistrations([burstProbe(OVERPRESSURE)], () => {
      const session = createScriptedSession()
      const start = standoff(session)
      const before = stateDigest(session.state())
      session.submit(start, burst(true))
      session.submit(start + 10, burst(false))
      const restored = readSnapshot(takeSnapshot(session.state()))
      if (!('state' in restored)) throw new Error(restored.problems.join('; '))
      expect(restored.state.players.p1.vehicle.gunBurst).toEqual(session.vehicle().gunBurst)
      expect(session.vehicle().gunBurst?.ventUntilTick).toBe(start + 10 + OVERPRESSURE.ventTicks)
      expect(stateDigest(session.state())).not.toBe(before)
    })
  })

  it('refuses a snapshot whose burst is not in whole ticks', () => {
    withRegistrations([burstProbe(OVERPRESSURE)], () => {
      const session = createScriptedSession()
      const start = standoff(session)
      session.submit(start, burst(true))
      const snapshot = takeSnapshot(session.state())
      const vehicle = snapshot.state.players.p1.vehicle as unknown as Record<string, unknown>
      vehicle.gunBurst = { onSinceTick: 1.5, ventUntilTick: 0, cycle: OVERPRESSURE }
      expect(readSnapshot(snapshot).problems.join('; ')).toMatch(/gunBurst/)
    })
  })
})

describe('turret burst: the cadence (ticket 383)', () => {
  it('fires faster than the track in a burst, then holds fire through the vent', () => {
    withRegistrations([burstProbe(OVERPRESSURE)], () => {
      const session = createScriptedSession()
      const start = standoff(session)
      session.submit(start, burst(true))
      standUntil(session, start, start + OVERPRESSURE.burstTicks)
      expect(shotsIn(session.events())).toBe(6)
      standUntil(session, start + OVERPRESSURE.burstTicks, start + 419)
      expect(shotsIn(session.events())).toBe(6)
    })
  })

  it("fires no more shots a minute under burst than the gun track's", () => {
    const trackShots = gunShotsPerSecond(stepOfMajor(1)) * 60
    expect(trackShots).toBe(120)
    expect(shotsInMinute(OVERPRESSURE, false)).toBe(trackShots)
    // 8 whole 420-tick cycles of 6 shots, and the 240 ticks left hold one more burst.
    expect(shotsInMinute(OVERPRESSURE, true)).toBe(54)
    expect(shotsInMinute(EVEN_BURST, true)).toBe(trackShots)
  })

  it('fires as the track does with no burst switched on, writing no burst field', () => {
    const without = shotsInMinute(null, false)
    expect(shotsInMinute(OVERPRESSURE, false)).toBe(without)
    withRegistrations([burstProbe(OVERPRESSURE)], () => {
      const session = createScriptedSession()
      standUntil(session, standoff(session), MINUTE_TICKS)
      expect(session.vehicle().gunBurst).toBeUndefined()
    })
  })
})
