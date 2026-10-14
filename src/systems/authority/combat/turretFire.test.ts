import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { enemyTier } from '../../economy/enemyStats'
import { gunShotDamage } from '../../economy/gunStats'
import { hullMax, onCurveLevel } from '../../economy/vehicleStats'
import {
  add,
  cmp,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  ZERO_MONEY,
  type BigStat,
} from '../../money'
import type { TurretShape } from '../../registries/autoGuns'
import { GUN_SHOT_QUANTA } from '../../vehicle/energyQuanta'
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, drill, type ScriptedSession } from '../scriptedSession'
import {
  CORRIDOR_MIDDLE,
  CORRIDOR_ROW,
  freezeEnemies,
  poseAt,
  prepareCorridor,
  setHull,
  setUpgrade,
  spawnEnemy,
} from './combatFixtures'
import type { Enemy } from './combatState'
import { BASE_TURRET_SHAPE } from './turretShape'
import { stepOfMajor } from '../../economy/upgradeSteps'

/** Planet 4's on-curve fight, as `gunFire.test.ts` stages it, in the planet 1 corridor. */
const PLANET = 4
const DRILL_LEVEL = onCurveLevel('drill_power', PLANET)
const HULL_LEVEL = onCurveLevel('hull', PLANET)
const BAND_3_TIER = enemyTier(PLANET, 3)
const REPORT_TICKS = 12
/** Gun level 1 fires every 30 ticks (#107). */
const SHOT_TICKS = 30
const SHOT_DAMAGE = gunShotDamage(stepOfMajor(DRILL_LEVEL))

const setGunLevel = (level: number): CommandIntent => ({
  type: 'debug.setGunLevel',
  payload: { level: stepOfMajor(level) },
})

function shapeWith(fields: Partial<TurretShape>): TurretShape {
  return { ...BASE_TURRET_SHAPE, ...fields }
}

/** A probe slice whose provider answers `shape`, counting each time the kernel asks. */
function turretProbe(shape: TurretShape | null, reads = { count: 0 }): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.autoGuns({
        id: 'probe.auto-guns',
        turretShapeOf: () => {
          reads.count += 1
          return shape
        },
      })
    },
  }
}

/** The corridor with the planet 4 on-curve rig and level-1 guns; returns the start tick. */
function armedCorridor(session: ScriptedSession, facing: Facing = FACING.right): number {
  const start = prepareCorridor(session, facing)
  session.submit(start, setUpgrade('drill_power', DRILL_LEVEL))
  session.submit(start, setUpgrade('hull', HULL_LEVEL))
  session.submit(start, setHull(toCanonical(hullMax(HULL_LEVEL))))
  session.submit(start, setGunLevel(1))
  return start
}

/** A report every 12 ticks from `from` to `to`, standing still, drilling or not. */
function standUntil(session: ScriptedSession, from: number, to: number, isDrilling = false) {
  for (let tick = from + REPORT_TICKS; tick <= to; tick += REPORT_TICKS) {
    session.submit(
      tick,
      isDrilling ? drillingPose() : poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }),
    )
  }
  session.advanceTo(to)
}

function drillingPose(): CommandIntent {
  const pose = poseAt(CORRIDOR_MIDDLE, { facing: FACING.right })
  if (pose.type !== 'reportPose') throw new Error('poseAt gives a pose report')
  return { ...pose, payload: { ...pose.payload, drilling: true, drillTicks: REPORT_TICKS } }
}

/** Frozen enemies at tile offsets from the rig, each `[kind, dx, dy]`; returns the start tick. */
function standoff(session: ScriptedSession, enemies: [string, number, number][]): number {
  const start = armedCorridor(session)
  session.submit(start, freezeEnemies(true))
  for (const [kind, dx, dy] of enemies) session.submit(start, spawnEnemy(kind, BAND_3_TIER, dx, dy))
  return start
}

function enemyOf(session: ScriptedSession, enemyId: string): Enemy {
  const enemy = session.state().combat.enemies.find((each) => each.id === enemyId)
  if (enemy === undefined) throw new Error(`no enemy ${enemyId}`)
  return enemy
}

function damageTaken(session: ScriptedSession, enemyId: string, full: BigStat): BigStat {
  return sub(full, enemyOf(session, enemyId).health)
}

const gunHitsIn = (events: readonly DomainEvent[]) =>
  events.filter(
    (event): event is Extract<DomainEvent, { type: 'GunHit' }> => event.type === 'GunHit',
  )

describe('turret shape: no provider, no change (ticket 382, acceptance 1)', () => {
  it('fires the same shots, kills and events with a provider answering #107 guns as with none', () => {
    const fight = (slices: SliceDefinition[]) =>
      withRegistrations(slices, () => {
        const session = createScriptedSession()
        const start = armedCorridor(session)
        session.submit(start, spawnEnemy('crawler', BAND_3_TIER, -5))
        standUntil(session, start, start + 600, true)
        return session.events()
      })
    const without = fight([])
    expect(gunHitsIn(without).length).toBeGreaterThan(0)
    expect(fight([turretProbe(null)])).toEqual(without)
    expect(fight([turretProbe(BASE_TURRET_SHAPE)])).toEqual(without)
  })

  it('writes no turret field into the state with no provider', () => {
    const session = createScriptedSession()
    const start = standoff(session, [['crawler', -3, 0]])
    standUntil(session, start, start + 120)
    expect(session.vehicle().stillSinceTick).toBeUndefined()
    expect(session.state().combat.vehicles.p1.directorPick).toBeUndefined()
    expect(
      session.state().combat.vehicles.p1.pendingGunHits.every((hit) => hit.energy === undefined),
    ).toBe(true)
  })

  it('reads the shape once per due shot, never while the guns wait out the interval', () => {
    const reads = { count: 0 }
    withRegistrations([turretProbe(BASE_TURRET_SHAPE, reads)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', -3, 0]])
      const full = enemyOf(session, 'e1').health
      reads.count = 0
      standUntil(session, start, start + 3 * SHOT_TICKS - 1)
      expect(reads.count).toBeGreaterThanOrEqual(3)
      const shotsDamage = mul(SHOT_DAMAGE, fromSafeInteger(reads.count))
      expect(damageTaken(session, 'e1', full)).toEqual(shotsDamage)
    })
  })
})

describe('turret shape: range and energy (ticket 382)', () => {
  function damageAt(rangeTiles: number, dx: number): BigStat {
    return withRegistrations([turretProbe(shapeWith({ rangeTiles }))], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', dx, 0]])
      const full = enemyOf(session, 'e1').health
      standUntil(session, start, start + 2 * SHOT_TICKS)
      return damageTaken(session, 'e1', full)
    })
  }

  it("reaches as far as the shape's range and no further", () => {
    expect(damageAt(5, -6)).toEqual(ZERO_MONEY)
    expect(cmp(damageAt(6, -6), ZERO_MONEY)).toBe(1)
  })

  it("takes the shape's energy a shot, and logs it on the shot's gun_hit", () => {
    const reads = { count: 0 }
    withRegistrations([turretProbe(shapeWith({ energyPerShotQuanta: 92 }), reads)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', -3, 0]])
      const before = session.vehicle().energy
      reads.count = 0
      standUntil(session, start, start + 2 * SHOT_TICKS)
      expect(reads.count).toBeGreaterThanOrEqual(2)
      expect(before - session.vehicle().energy).toBe(reads.count * 92)
      const hits = gunHitsIn(session.events())
      expect(hits.reduce((total, hit) => total + hit.energy, 0)).toBe(reads.count * 92)
      expect(hits.every((hit) => hit.energy === hit.shots * 92)).toBe(true)
      expect(92).toBeLessThan(GUN_SHOT_QUANTA)
    })
  })
})

describe('turret shape: grapeshot (ticket 382, acceptance 2)', () => {
  const GRAPE = shapeWith({ grape: { targets: 2, coneDeg: 30 } })

  it('splits each shot across two enemies in the cone, adding no damage', () => {
    withRegistrations([turretProbe(GRAPE)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [
        ['crawler', -3, 0],
        ['crawler', -5, 0],
      ])
      const full = enemyOf(session, 'e1').health
      standUntil(session, start, start + 2 * SHOT_TICKS - 1)
      const near = damageTaken(session, 'e1', full)
      const far = damageTaken(session, 'e2', full)
      expect(cmp(near, ZERO_MONEY)).toBe(1)
      expect(cmp(far, ZERO_MONEY)).toBe(1)
      expect(add(near, far)).toEqual(add(SHOT_DAMAGE, SHOT_DAMAGE))
    })
  })

  it('never splits onto an enemy in the cone with rock between, so the aimed one takes it all', () => {
    withRegistrations([turretProbe(GRAPE)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [
        ['crawler', -3, 0],
        ['burrower', -5, -1],
      ])
      const crawlerFull = enemyOf(session, 'e1').health
      const burrowerFull = enemyOf(session, 'e2').health
      standUntil(session, start, start + SHOT_TICKS - 1)
      expect(damageTaken(session, 'e1', crawlerFull)).toEqual(SHOT_DAMAGE)
      expect(damageTaken(session, 'e2', burrowerFull)).toEqual(ZERO_MONEY)
    })
  })
})

describe('turret shape: concussion shells (ticket 382)', () => {
  const KNOCK = shapeWith({ knock: { cells: 2, cooldownTicks: 180 } })

  it('pushes the enemy two cells back on a hit, then not again within its cooldown', () => {
    withRegistrations([turretProbe(KNOCK)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', -3, 0]])
      const x0 = enemyOf(session, 'e1').x
      standUntil(session, start, start + SHOT_TICKS - 1)
      const knocked = enemyOf(session, 'e1')
      expect(x0 - knocked.x).toBe(2000)
      expect(knocked.knockedTick).toBeDefined()
      standUntil(session, start + SHOT_TICKS - 1, start + 3 * SHOT_TICKS - 1)
      expect(enemyOf(session, 'e1').x).toBe(knocked.x)
      expect(cmp(enemyOf(session, 'e1').health, knocked.health)).toBe(-1)
    })
  })

  it('stops the push at the rock, cutting no cell', () => {
    withRegistrations([turretProbe(shapeWith({ knock: { cells: 4, cooldownTicks: 180 } }))], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', -5, 0]])
      const world = session.state().world
      standUntil(session, start, start + SHOT_TICKS - 1)
      expect(enemyOf(session, 'e1').x).toBeGreaterThanOrEqual((CORRIDOR_MIDDLE.tx - 6) * 1000)
      expect(session.state().world).toBe(world)
    })
  })
})

describe('turret shape: the sentry cam (ticket 382, acceptance 3)', () => {
  const SENTRY = shapeWith({ forwardConeAfterTicks: 60 })

  it('covers the drill cone after the rig stands still, and closes it the tick drilling resumes', () => {
    withRegistrations([turretProbe(SENTRY)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', 4, 0]])
      const full = enemyOf(session, 'e1').health
      standUntil(session, start, start + 59)
      expect(damageTaken(session, 'e1', full)).toEqual(ZERO_MONEY)
      session.advanceTo(start + 60)
      expect(damageTaken(session, 'e1', full)).toEqual(SHOT_DAMAGE)
      standUntil(session, start + 60, start + 108)
      const resumed = start + 120
      session.submit(resumed, drillingPose())
      const atResume = enemyOf(session, 'e1').health
      standUntil(session, resumed, resumed + 300, true)
      expect(enemyOf(session, 'e1').health).toEqual(atResume)
    })
  })

  it('never covers the cone without the sentry cam, however long the rig stands', () => {
    withRegistrations([turretProbe(BASE_TURRET_SHAPE)], () => {
      const session = createScriptedSession()
      const start = standoff(session, [['crawler', 4, 0]])
      const full = enemyOf(session, 'e1').health
      standUntil(session, start, start + 300)
      expect(damageTaken(session, 'e1', full)).toEqual(ZERO_MONEY)
      expect(session.vehicle().stillSinceTick).toBeDefined()
    })
  })
})

describe('turret shape: the ricochet (ticket 382, acceptance 3)', () => {
  /** Bores row 296 under the corridor's left end, a pocket the corridor's line cannot see into. */
  function borePocket(session: ScriptedSession, from: number): number {
    let tick = from
    for (const tx of [14, 15, 16]) {
      const above: TilePoint = { tx, ty: CORRIDOR_ROW }
      session.submit(tick, poseAt(above, { facing: FACING.down }))
      session.submit(tick + 30, drill({ tx, ty: CORRIDOR_ROW - 1 }, 30))
      tick += 31
    }
    session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
    return tick
  }

  function pocketFight(shape: TurretShape, kind: string, dy: number) {
    return withRegistrations([turretProbe(shape)], () => {
      const session = createScriptedSession()
      const armed = armedCorridor(session)
      const start = borePocket(session, armed)
      session.submit(start, freezeEnemies(true))
      session.submit(start, spawnEnemy(kind, BAND_3_TIER, -6, dy))
      const full = enemyOf(session, 'e1').health
      standUntil(session, start, start + 2 * SHOT_TICKS - 1)
      return damageTaken(session, 'e1', full)
    })
  }

  it('cannot reach the enemy in the pocket in a straight line', () => {
    expect(pocketFight(BASE_TURRET_SHAPE, 'crawler', -1)).toEqual(ZERO_MONEY)
  })

  it("reaches it with one bounce off the wall, for a straight shot's damage", () => {
    const bounced = pocketFight(shapeWith({ bounceLegCells: 6 }), 'crawler', -1)
    expect(bounced).toEqual(add(SHOT_DAMAGE, SHOT_DAMAGE))
  })

  it('refuses a bounce through rock: a burrower in the rock below stays untouched', () => {
    expect(pocketFight(shapeWith({ bounceLegCells: 6 }), 'burrower', -2)).toEqual(ZERO_MONEY)
  })
})
