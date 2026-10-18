import { afterEach, describe, expect, it, vi } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { enemyHealth, enemyTier } from '../../economy/enemyStats'
import { gunShotDamage } from '../../economy/gunStats'
import { stepOfMajor } from '../../economy/upgradeSteps'
import { hullMax, onCurveLevel, onCurveStep } from '../../economy/vehicleStats'
import { cmp, fromSafeInteger, mul, sub, toCanonical } from '../../money'
import type { TurretShape } from '../../registries/autoGuns'
import { FACING, tileOfMillimetres } from '../../vehicle/vehiclePose'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import {
  CORRIDOR_MIDDLE,
  CORRIDOR_ROW,
  poseAt,
  prepareCorridor,
  setHull,
  setUpgrade,
  spawnEnemy,
} from './combatFixtures'
import { NO_PENDING_DRILL, withCombatVehicle, type Enemy } from './combatState'
import * as dustTrail from './dustTrail'
import type { Terrain } from './enemyMovement'
import { walkStepMmOf } from './enemyMovement'
import { pretrainOf } from './turretPretrain'
import { BASE_TURRET_SHAPE } from './turretShape'
import { vehicleTargetOf } from './vehicleTarget'

/** Planet 4's on-curve rig with level-1 guns, firing every 30 ticks (#107). */
const PLANET = 4
const BAND_3_TIER = enemyTier(PLANET, 3)
const SHOT_DAMAGE = gunShotDamage(onCurveStep('drill_power', PLANET))
const REPORT_TICKS = 12
const SPOTTER: TurretShape = { ...BASE_TURRET_SHAPE, pretrainTicks: 8 }
const RIG_X = CORRIDOR_MIDDLE.tx * 1000 + 500
const FLOOR_Y = CORRIDOR_ROW * 1000

/** A probe slice whose provider answers `shape` for every player. */
function turretProbe(shape: TurretShape): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.autoGuns({ id: 'probe.auto-guns', turretShapeOf: () => shape })
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('turret pre-train: the hold on a due shot (K-pretrain, ticket 413)', () => {
  /** A hunting burrower of p1 at absolute mm `(x, y)`. */
  const burrowerAt = (number: number, x: number, y: number): Enemy => ({
    id: `e${number}`,
    kind: 'burrower',
    tier: 1,
    spawnPointId: 'debug',
    ownerId: 'p1',
    x,
    y,
    health: enemyHealth('burrower', 1),
    phase: 'approach',
    phaseSinceTick: 0,
    readyTick: 0,
    step: { x: 0, y: 0 },
    pendingDrill: NO_PENDING_DRILL,
    ring: null,
  })
  const STEP_MM = walkStepMmOf(burrowerAt(1, 0, 0))
  const DUE = 1000

  /** The corridor rig, its guns due at `DUE`, with these burrowers about it. */
  function corridorWith(enemies: Enemy[]): { state: AuthorityState; terrain: Terrain } {
    const session = createScriptedSession()
    prepareCorridor(session, FACING.right)
    const bare = session.state()
    const combat = withCombatVehicle(bare.combat, 'p1', { gunReadyTick: DUE })
    const state = { ...bare, combat: { ...combat, enemies } }
    const params = planetParamsOf(state.planet)
    if (params === null) throw new Error('the corridor is on a planet')
    return { state, terrain: { world: state.world, params } }
  }

  function pretrainAt(shape: TurretShape, enemies: Enemy[], tick: number) {
    const { state, terrain } = corridorWith(enemies)
    const target = vehicleTargetOf(state, 'p1', state.tick)
    if (target === null) throw new Error('the rig stands in the corridor')
    return pretrainOf(state, terrain, target, shape, tick)
  }

  /** In rock under the corridor, `ticks` walking steps from its floor. */
  const underFloor = (number: number, ticks: number) =>
    burrowerAt(number, RIG_X - 3000, FLOOR_Y - ticks * STEP_MM)

  it('never reads the dust trail without a pre-train, and keeps the fire tick as the schedule', () => {
    withRegistrations([], () => {
      const reads = vi.spyOn(dustTrail, 'dustTrailWarningsOf')
      const pretrain = pretrainAt(BASE_TURRET_SHAPE, [underFloor(1, 2)], DUE + 3)
      expect(pretrain).toMatchObject({ isHolding: false, scheduleTick: DUE + 3 })
      expect(pretrain.surfacedIds.size).toBe(0)
      expect(reads).not.toHaveBeenCalled()
    })
  })

  it('holds while a burrower in rock reaches the open within the ticks the hold has left', () => {
    withRegistrations([], () => {
      expect(pretrainAt(SPOTTER, [underFloor(1, 2)], DUE).isHolding).toBe(true)
      expect(pretrainAt(SPOTTER, [underFloor(1, 2)], DUE + 6).isHolding).toBe(true)
      expect(pretrainAt(SPOTTER, [underFloor(1, 2)], DUE + 7).isHolding).toBe(false)
      expect(pretrainAt(SPOTTER, [underFloor(1, 9)], DUE).isHolding).toBe(false)
    })
  })

  it('never holds past the cap, and keeps the due tick as the schedule inside the window only', () => {
    withRegistrations([], () => {
      const atCap = pretrainAt(SPOTTER, [underFloor(1, 0)], DUE + 8)
      expect(atCap).toMatchObject({ isHolding: false, scheduleTick: DUE })
      expect(pretrainAt(SPOTTER, [underFloor(1, 0)], DUE + 9).scheduleTick).toBe(DUE + 9)
    })
  })

  it('stops holding once a burrower breaks the surface, and names it to rank first', () => {
    withRegistrations([], () => {
      const surfaced = burrowerAt(2, RIG_X - 2000, FLOOR_Y + 1)
      const pretrain = pretrainAt(SPOTTER, [underFloor(1, 2), surfaced], DUE + 1)
      expect(pretrain.isHolding).toBe(false)
      expect([...pretrain.surfacedIds]).toEqual(['e2'])
      expect(pretrainAt(SPOTTER, [surfaced], DUE).surfacedIds.size).toBe(0)
    })
  })
})

describe('turret pre-train: in a fight (K-pretrain, ticket 413, acceptance 1-3)', () => {
  /** A crawler down the corridor and two burrowers coming through the rock below it. */
  const PACK: [string, number, number][] = [
    ['crawler', -6, 0],
    ['burrower', -7, -2],
    ['burrower', 6, -3],
  ]
  const FIGHT_TICKS = 240

  /** A shot as the state shows it; a kill leaves no enemy to name, so only survivors are listed. */
  interface Shot {
    tick: number
    gunReadyTick: number
    hitIds: string[]
    hitsInOpen: boolean
  }

  interface Fight {
    events: DomainEvent[]
    shots: Shot[]
    start: number
  }

  function armedCorridor(session: ScriptedSession): number {
    const start = prepareCorridor(session, FACING.right)
    const hullLevel = onCurveLevel('hull', PLANET)
    session.submit(start, setUpgrade('drill_power', onCurveLevel('drill_power', PLANET)))
    session.submit(start, setUpgrade('hull', hullLevel))
    session.submit(start, setHull(toCanonical(hullMax(hullLevel))))
    session.submit(start, { type: 'debug.setGunLevel', payload: { level: stepOfMajor(1) } })
    for (const [kind, dx, dy] of PACK) session.submit(start, spawnEnemy(kind, BAND_3_TIER, dx, dy))
    return start
  }

  /** The fight tick by tick, noting each shot: its tick, the next due tick, whom it hit. */
  function fight(slices: SliceDefinition[]): Fight {
    return withRegistrations(slices, () => {
      const session = createScriptedSession()
      const start = armedCorridor(session)
      const shots: Shot[] = []
      for (let tick = start + 1; tick <= start + FIGHT_TICKS; tick++) {
        const before = session.state()
        if ((tick - start) % REPORT_TICKS === 0) {
          session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
        }
        session.advanceTo(tick)
        const shot = shotOf(before, session.state(), tick)
        if (shot !== null) shots.push(shot)
      }
      return { events: session.events(), shots, start }
    })
  }

  function shotOf(before: AuthorityState, after: AuthorityState, tick: number): Shot | null {
    const gunReadyTick = after.combat.vehicles.p1.gunReadyTick
    if (gunReadyTick === before.combat.vehicles.p1?.gunReadyTick) return null
    const hit = after.combat.enemies.filter((enemy) => isShotAt(before, enemy))
    return {
      tick,
      gunReadyTick,
      hitIds: hit.map((enemy) => enemy.id),
      hitsInOpen: hit.every((enemy) => isInOpenCell(after, enemy)),
    }
  }

  /** A whole shot's damage this tick: drill damage on a pinned enemy comes in other amounts. */
  function isShotAt(before: AuthorityState, enemy: Enemy): boolean {
    const was = before.combat.enemies.find((each) => each.id === enemy.id)
    return was !== undefined && cmp(sub(was.health, enemy.health), SHOT_DAMAGE) === 0
  }

  function isInOpenCell(state: AuthorityState, enemy: Enemy): boolean {
    const params = planetParamsOf(state.planet)
    if (params === null) return false
    const cell = cellAt(state.world, params, tileOfMillimetres(enemy.x, enemy.y))
    return kindOfCell(cell) === CELL_KIND.air
  }

  const gunHitsIn = (events: readonly DomainEvent[]) =>
    events.filter(
      (event): event is Extract<DomainEvent, { type: 'GunHit' }> => event.type === 'GunHit',
    )

  it('is byte-identical with no spotter, and never reads the dust trail', () => {
    const bare = fight([])
    const reads = vi.spyOn(dustTrail, 'dustTrailWarningsOf')
    const plain = fight([turretProbe(BASE_TURRET_SHAPE)])
    expect(reads).not.toHaveBeenCalled()
    expect(plain.events).toEqual(bare.events)
    expect(plain.shots).toEqual(bare.shots)
    fight([turretProbe(SPOTTER)])
    expect(reads).toHaveBeenCalled()
  })

  it('holds the due shot until the burrower breaks the surface, then shoots it first', () => {
    const plain = fight([turretProbe(BASE_TURRET_SHAPE)])
    const spotted = fight([turretProbe(SPOTTER)])
    const due = plain.start + 151
    expect(plain.shots.find((shot) => shot.tick === due)?.hitIds).toEqual(['e1'])
    expect(spotted.shots.find((shot) => shot.tick === due)).toBeUndefined()
    expect(spotted.shots.find((shot) => shot.tick === due + 1)).toEqual({
      tick: due + 1,
      gunReadyTick: due + 30,
      hitIds: ['e2'],
      hitsInOpen: true,
    })
  })

  it('keeps every due tick on the schedule, holding at most the cap and shooting only the open', () => {
    const plain = fight([turretProbe(BASE_TURRET_SHAPE)])
    const spotted = fight([turretProbe(SPOTTER)])
    expect(spotted.shots.map((shot) => shot.gunReadyTick)).toEqual(
      plain.shots.map((shot) => shot.gunReadyTick),
    )
    const late = spotted.shots.filter((shot, index) => shot.tick !== plain.shots[index].tick)
    expect(late.length).toBeGreaterThan(0)
    for (const [index, shot] of spotted.shots.entries()) {
      expect(shot.tick - plain.shots[index].tick).toBeLessThanOrEqual(8)
      expect(shot.hitsInOpen).toBe(true)
    }
  })

  it('fires the same shots for the same damage each, with and without the spotter', () => {
    const shotsOf = (hits: ReturnType<typeof gunHitsIn>) =>
      hits.reduce((total, hit) => total + hit.shots, 0)
    const isWholeShots = (hit: ReturnType<typeof gunHitsIn>[number]) =>
      hit.damage === toCanonical(mul(SHOT_DAMAGE, fromSafeInteger(hit.shots)))
    const plain = gunHitsIn(fight([turretProbe(BASE_TURRET_SHAPE)]).events)
    const spotted = gunHitsIn(fight([turretProbe(SPOTTER)]).events)
    expect(shotsOf(plain)).toBeGreaterThan(0)
    expect(shotsOf(spotted)).toBe(shotsOf(plain))
    expect(spotted.every(isWholeShots)).toBe(true)
    expect(plain.every(isWholeShots)).toBe(true)
  })
})
