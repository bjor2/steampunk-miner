import { describe, expect, it } from 'vitest'
import { runEventProblems } from '../../../logging/runEventSchema'
import { projectDomainEvent } from '../../../logging/domainEventLog'
import { LOG_SCHEMA_VERSION } from '../../../logging/runEvent'
import { enemyTier } from '../../economy/enemyStats'
import { gunShotDamage } from '../../economy/gunStats'
import { hullMax, onCurveLevel } from '../../economy/vehicleStats'
import { add, fromCanonical, fromSafeInteger, mul, toCanonical, ZERO_MONEY } from '../../money'
import { GUN_SHOT_QUANTA } from '../../vehicle/energyQuanta'
import { isGunIdleForSteam } from '../../vehicle/vehicleGun'
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
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
import { stepOfMajor } from '../../economy/upgradeSteps'

/** Planet 4's on-curve fight (#107 numbers acceptance 3): drill and hull levels, band-3 enemies. */
const PLANET = 4
const DRILL_LEVEL = onCurveLevel('drill_power', PLANET)
const HULL_LEVEL = onCurveLevel('hull', PLANET)
const BAND_3_TIER = enemyTier(PLANET, 3)
/** Pose reports at the shell's 5 Hz. */
const REPORT_TICKS = 12

/** The guns at major `level`, sent as its step (#180). */
const setGunLevel = (level: number): CommandIntent => ({
  type: 'debug.setGunLevel',
  payload: { level: stepOfMajor(level) },
})
const setGunMode = (mode: string): CommandIntent => ({ type: 'setGunMode', payload: { mode } })
const setEnergy = (energy: string): CommandIntent => ({
  type: 'debug.setEnergy',
  payload: { energy },
})

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

/** Facing `facing` and drilling at every report, as a player boring on while the guns work. */
function drillingPose(facing: Facing): CommandIntent {
  const pose = poseAt(CORRIDOR_MIDDLE, { facing })
  if (pose.type !== 'reportPose') throw new Error('poseAt gives a pose report')
  return { ...pose, payload: { ...pose.payload, drilling: true, drillTicks: REPORT_TICKS } }
}

/** The corridor with the planet 4 on-curve vehicle, guns at `gunLevel`; returns the start tick. */
function armedCorridor(session: ScriptedSession, facing: Facing, gunLevel = 1): number {
  const start = prepareCorridor(session, facing)
  session.submit(start, setUpgrade('drill_power', DRILL_LEVEL))
  session.submit(start, setUpgrade('hull', HULL_LEVEL))
  session.submit(start, setHull(toCanonical(hullMax(HULL_LEVEL))))
  session.submit(start, setGunLevel(gunLevel))
  return start
}

/** Reports a drilling pose every 12 ticks for `ticks` ticks after `start`. */
function fightFor(session: ScriptedSession, start: number, facing: Facing, ticks: number): void {
  for (let tick = start + REPORT_TICKS; tick <= start + ticks; tick += REPORT_TICKS) {
    session.submit(tick, drillingPose(facing))
  }
  session.advanceTo(start + ticks)
}

function gunKillsIn(events: readonly DomainEvent[]) {
  return ofType(events, 'EnemyKilled').filter((kill) => kill.by === 'gun')
}

function shotsIn(events: readonly DomainEvent[]): number {
  return ofType(events, 'GunHit').reduce((total, hit) => total + hit.shots, 0)
}

/** A crawler `dx` tiles along the corridor, at planet 4's band-3 tier, hunting the vehicle. */
function flankerFight(facing: Facing, dx: number) {
  const session = createScriptedSession()
  const start = armedCorridor(session, facing)
  session.submit(start, spawnEnemy('crawler', BAND_3_TIER, dx))
  fightFor(session, start, facing, 600)
  return session
}

describe('guns: the flankers they are for (#107 combat scenarios)', () => {
  it('kills a rear flanker with the guns while the vehicle drills forward', () => {
    const session = flankerFight(FACING.right, -5)
    expect(gunKillsIn(session.events())).toHaveLength(1)
    expect(session.state().combat.enemies).toEqual([])
  })

  it('kills a side flanker with the guns while the vehicle drills down', () => {
    const session = flankerFight(FACING.down, 5)
    expect(gunKillsIn(session.events())).toHaveLength(1)
  })

  it('lets a planet 4 flanker land at least one attack before it dies (acceptance 3)', () => {
    const events = flankerFight(FACING.right, -5).events()
    const kill = gunKillsIn(events)[0]
    const hits = ofType(events, 'VehicleDamaged').filter((hit) => hit.tick < kill.tick)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.every((hit) => hit.arc === 'rear')).toBe(true)
  })

  it('takes 6 +- 1 shots for the on-curve kill, each a quarter of the drill power', () => {
    const events = flankerFight(FACING.right, -5).events()
    const hits = ofType(events, 'GunHit')
    const damage = hits.reduce((total, hit) => add(total, fromCanonical(hit.damage)), ZERO_MONEY)
    const shots = shotsIn(events)
    expect(Math.abs(shots - 6)).toBeLessThanOrEqual(1)
    expect(damage).toEqual(mul(gunShotDamage(stepOfMajor(DRILL_LEVEL)), fromSafeInteger(shots)))
    expect(hits.every((hit) => hit.shots >= 1 && hit.energy === hit.shots * GUN_SHOT_QUANTA)).toBe(
      true,
    )
  })
})

describe('guns: what they never shoot (#107)', () => {
  it('never targets an enemy in the forward cone the drill owns', () => {
    const session = createScriptedSession()
    const start = armedCorridor(session, FACING.right)
    session.submit(start, freezeEnemies(true))
    session.submit(start, spawnEnemy('crawler', BAND_3_TIER, 4))
    fightFor(session, start, FACING.right, 300)
    expect(shotsIn(session.events())).toBe(0)
    expect(session.state().combat.enemies).toHaveLength(1)
  })

  it('never hits a burrower inside the rock, but does once it is in the open', () => {
    const inRock = createScriptedSession()
    const start = armedCorridor(inRock, FACING.right)
    inRock.submit(start, freezeEnemies(true))
    inRock.submit(start, spawnEnemy('burrower', BAND_3_TIER, 0, -3))
    fightFor(inRock, start, FACING.right, 300)
    expect(shotsIn(inRock.events())).toBe(0)

    const inTunnel = createScriptedSession()
    const tunnelStart = armedCorridor(inTunnel, FACING.right)
    inTunnel.submit(tunnelStart, freezeEnemies(true))
    inTunnel.submit(tunnelStart, spawnEnemy('burrower', BAND_3_TIER, -3))
    fightFor(inTunnel, tunnelStart, FACING.right, 300)
    expect(shotsIn(inTunnel.events())).toBeGreaterThan(0)
  })

  it('holds fire when switched off', () => {
    const session = createScriptedSession()
    const start = armedCorridor(session, FACING.right)
    session.submit(start, setGunMode('off'))
    session.submit(start, freezeEnemies(true))
    session.submit(start, spawnEnemy('crawler', BAND_3_TIER, -3))
    fightFor(session, start, FACING.right, 300)
    expect(shotsIn(session.events())).toBe(0)
  })
})

describe('guns: steam (#107 numbers acceptance 4)', () => {
  /** Shots tallied so far, logged by one still pose report. */
  function shotsAfterReport(session: ScriptedSession, tick: number): number {
    session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
    return shotsIn(session.events())
  }

  function frozenRearCrawler(energy: string | null) {
    const session = createScriptedSession()
    const start = armedCorridor(session, FACING.right)
    session.submit(start, freezeEnemies(true))
    if (energy !== null) session.submit(start, setEnergy(energy))
    session.submit(start, spawnEnemy('crawler', BAND_3_TIER, -3))
    return { session, start }
  }

  it('take 120 quanta a shot from the boiler, every 30 ticks at level 1', () => {
    const { session, start } = frozenRearCrawler(null)
    const before = session.vehicle().energy
    session.advanceTo(start + 95)
    expect(before - session.vehicle().energy).toBe(4 * GUN_SHOT_QUANTA)
    expect(shotsAfterReport(session, start + 96)).toBe(4)
  })

  it('stop where a shot would take the tank under the rescue floor, and say so', () => {
    // Level-0 boiler: 150 units, so the rescue floor is 37.5 units; 38 units leave one shot.
    const { session, start } = frozenRearCrawler('38')
    session.advanceTo(start + 300)
    expect(shotsAfterReport(session, start + 301)).toBe(1)
    expect(session.vehicle().energy).toBe(37.5 * 240)
    expect(isGunIdleForSteam(session.vehicle())).toBe(true)
  })
})

describe('guns: what they log (#107 logging)', () => {
  it('sums the shots since the last pose report into one gun_hit per enemy', () => {
    const session = createScriptedSession()
    const start = armedCorridor(session, FACING.right)
    session.submit(start, freezeEnemies(true))
    session.submit(start, spawnEnemy('crawler', BAND_3_TIER, -3))
    session.advanceTo(start + 95)
    const report = session.submit(start + 96, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
    expect(ofType(report, 'GunHit')).toEqual([
      expect.objectContaining({
        enemyId: 'e1',
        shots: 4,
        energy: 4 * GUN_SHOT_QUANTA,
        damage: toCanonical(mul(gunShotDamage(stepOfMajor(DRILL_LEVEL)), fromSafeInteger(4))),
      }),
    ])
  })

  it('logs gun_hit before enemy_killed {by: gun}, every line valid against the registry', () => {
    const events = flankerFight(FACING.right, -5).events()
    const types = events.map((event) => event.type)
    expect(types.lastIndexOf('GunHit')).toBeLessThan(types.indexOf('EnemyKilled'))
    const lines = events.map(projectDomainEvent).flatMap((line) => (line === null ? [] : [line]))
    const gunLines = lines.filter((projected) => projected.line.event === 'gun_hit')
    expect(gunLines.length).toBeGreaterThan(0)
    for (const { tick, cmd, line } of lines) {
      const envelope = {
        v: LOG_SCHEMA_VERSION,
        seq: 1,
        tick,
        timestamp: 0,
        runId: 'run',
        playerId: 'p1',
        planet: 1,
        depthTiles: 0,
      }
      expect(runEventProblems({ ...envelope, cmd, event: line.event, data: line.data })).toEqual([])
    }
  })
})

describe('guns: determinism', () => {
  it('fires the same shots when the clock moves a tick at a time as when commands move it', () => {
    const byCommands = flankerFight(FACING.right, -5)
    const session = createScriptedSession()
    const start = armedCorridor(session, FACING.right)
    session.submit(start, spawnEnemy('crawler', BAND_3_TIER, -5))
    for (let tick = start + 1; tick <= start + 600; tick++) {
      if ((tick - start) % REPORT_TICKS === 0) session.submit(tick, drillingPose(FACING.right))
      session.advanceTo(tick)
    }
    expect(stateDigest(session.state())).toBe(stateDigest(byCommands.state()))
    expect(session.events()).toEqual(byCommands.events())
  })
})
