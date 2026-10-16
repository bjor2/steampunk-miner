import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { vehicleOf } from '../../../systems/authority/authorityState'
import { poseAt } from '../../../systems/authority/combat/combatFixtures'
import {
  BASE_TURRET_SHAPE,
  checkedTurretShape,
  turretShapeOf,
} from '../../../systems/authority/combat/turretShape'
import { isHollowPocketCell } from '../../../systems/authority/hollowPocket'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { ECONOMY } from '../../../systems/economy/economy'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { GUN_SHOT_FLOOR_QUANTA, GUN_SHOT_QUANTA } from '../../../systems/vehicle/energyQuanta'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { maxViewVerticalOf } from '../../../systems/render/viewZoom'
import { lastMarkOf } from '../../tech-tree'
import {
  autoGunsMarkLadderOf,
  EXTENDED_BARRELS_ITEM_ID,
  FIRE_DIRECTOR_ITEM_ID,
  RICOCHET_SHOT_ITEM_ID,
  SHIPPED_AUTO_GUNS_MODULES,
} from './autoGunsLane'
import { moduleShapeOf, playerTurretShapeOf } from './turretShapes'

const PLAYER = 'p1'
/** A tile is a metre (#4); the view is sized in metres (#39). */
const METRES_PER_TILE = 1
const ALL_MODULES = SHIPPED_AUTO_GUNS_MODULES.map((module) => module.itemId)
/** Past every module's last Mark: a Mastered module must still answer a shape the kernel takes. */
const MARKS_PAST_MASTERED = 5

const mountGuns: CommandIntent = { type: 'debug.setGunLevel', payload: { level: stepOfMajor(1) } }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

/** A rig standing at `tile`, owning `owned`, its guns mounted or not. */
function rigWith(owned: readonly string[], isMounted: boolean, tile?: TilePoint): ScriptedSession {
  const session = createScriptedSession()
  if (isMounted) session.submit(0, mountGuns)
  session.submit(0, own(owned))
  if (tile !== undefined) session.submit(1, poseAt(tile, { facing: FACING.right }))
  session.advanceTo(2)
  return session
}

/** The first tile down the dock column that generation hollowed out and is still open. */
function firstHollowTileDown(session: ScriptedSession): TilePoint {
  const state = session.state()
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('no planet')
  for (let ty = params.radiusTiles - 2; ty > -params.radiusTiles; ty--) {
    const tile = { tx: 0, ty }
    if (isHollowPocketCell(state.world, params, tile)) return tile
  }
  throw new Error('no hollow pocket down the dock column')
}

describe('ground-gun: the auto_guns modules shape the turret (ticket 388)', () => {
  it('asks nothing of the turret before the guns are mounted, whatever the rig owns', () => {
    expect(playerTurretShapeOf(rigWith(ALL_MODULES, false).state(), PLAYER)).toBeNull()
  })

  it('asks nothing once the guns are mounted while no module is owned', () => {
    expect(playerTurretShapeOf(rigWith([], true).state(), PLAYER)).toBeNull()
  })

  it('folds every owned module at Mark 1 into one shape once the guns are mounted', () => {
    const shape = playerTurretShapeOf(rigWith(ALL_MODULES, true).state(), PLAYER)

    expect(shape).toEqual({
      rangeTiles: 9,
      energyPerShotQuanta: GUN_SHOT_QUANTA,
      targetOrder: 'director',
      retargetTicks: 30,
      forwardConeAfterTicks: 60,
      knock: { cells: 2, cooldownTicks: 180 },
      grape: { targets: 2, coneDeg: 30 },
      burst: { burstTicks: 120, ventTicks: 300, intervalNumerator: 2, intervalDenominator: 3 },
      bounceLegCells: null,
      pretrainTicks: null,
    })
  })

  it("is the shape the kernel's turret reads through the registered provider", () => {
    const state = rigWith(ALL_MODULES, true).state()

    expect(turretShapeOf(state, PLAYER)).toEqual(playerTurretShapeOf(state, PLAYER))
  })

  it('leaves the shape alone for a module that only flushes burrowers', () => {
    const state = rigWith(['weapon.flushing_shell'], true).state()

    expect(playerTurretShapeOf(state, PLAYER)).toBeNull()
  })

  it('stops the range at 10 tiles at every Mark of the extended barrels', () => {
    const ranges = marksOf(EXTENDED_BARRELS_ITEM_ID).map(
      (mark) => moduleShapeOf({ itemId: EXTENDED_BARRELS_ITEM_ID, mark }).rangeTiles,
    )

    expect(Math.max(...ranges)).toBe(ECONOMY.gun.turretCaps.gunRangeCap)
    expect(ranges.slice(0, 2)).toEqual([9, 10])
  })

  it('keeps every target the guns can reach on a 16:9 screen zoomed fully out (TD on #322)', () => {
    const halfShortAxisMetres = maxViewVerticalOf(1920, 1080) / 2

    expect(ECONOMY.gun.turretCaps.gunRangeCap * METRES_PER_TILE).toBeLessThanOrEqual(
      halfShortAxisMetres,
    )
  })

  it('lowers energy a shot past the range cap to the floor, never under it', () => {
    const energyAt = (mark: number) =>
      moduleShapeOf({ itemId: EXTENDED_BARRELS_ITEM_ID, mark }).energyPerShotQuanta
    const last = lastMarkOf(autoGunsMarkLadderOf(EXTENDED_BARRELS_ITEM_ID))

    expect([energyAt(1), energyAt(2), energyAt(3)]).toEqual([GUN_SHOT_QUANTA, GUN_SHOT_QUANTA, 111])
    expect(energyAt(last)).toBe(GUN_SHOT_FLOOR_QUANTA)
    expect(energyAt(last + MARKS_PAST_MASTERED)).toBe(GUN_SHOT_FLOOR_QUANTA)
  })

  it("answers a shape inside the kernel's caps at every Mark of every module, the burst's net rate included", () => {
    const shapes = ALL_MODULES.flatMap((itemId) =>
      marksOf(itemId).map((mark) => moduleShapeOf({ itemId, mark })),
    )

    expect(() => shapes.forEach(checkedTurretShape)).not.toThrow()
  })

  it('bounces a ricochet only while the rig stands inside a hollow pocket', () => {
    const probe = createScriptedSession()
    const pocket = firstHollowTileDown(probe)
    const inPocket = rigWith([RICOCHET_SHOT_ITEM_ID], true, pocket).state()
    const outside = rigWith([RICOCHET_SHOT_ITEM_ID], true, { tx: 20, ty: 297 }).state()

    expect(vehicleOf(inPocket, PLAYER).pose).not.toBeNull()
    expect(playerTurretShapeOf(inPocket, PLAYER)).toEqual({
      ...BASE_TURRET_SHAPE,
      bounceLegCells: 3,
    })
    expect(playerTurretShapeOf(outside, PLAYER)).toBeNull()
  })
})

describe('ground-gun: the spotter guns pre-train the turret (ticket 320)', () => {
  const SPOTTER = 'combo.spotter_guns'
  const PERISCOPE = 'passive.threat_periscope'
  const directorShape = () =>
    playerTurretShapeOf(rigWith([FIRE_DIRECTOR_ITEM_ID], true).state(), PLAYER)

  it('holds a due shot up to the 8-tick cap with the combo, the director and the periscope', () => {
    const spotted = rigWith([FIRE_DIRECTOR_ITEM_ID, PERISCOPE, SPOTTER], true).state()
    expect(playerTurretShapeOf(spotted, PLAYER)).toEqual({
      ...directorShape(),
      pretrainTicks: ECONOMY.gun.turretCaps.maxPretrainTicks,
    })
    expect(turretShapeOf(spotted, PLAYER).pretrainTicks).toBe(8)
  })

  it('leaves the director as it was while the combo is not owned', () => {
    const unowned = rigWith([FIRE_DIRECTOR_ITEM_ID, PERISCOPE], true).state()
    expect(playerTurretShapeOf(unowned, PLAYER)).toEqual(directorShape())
    expect(directorShape()?.pretrainTicks).toBeNull()
  })

  it('resolves only with both parents: no pre-train without the periscope or the director', () => {
    const noPeriscope = rigWith([FIRE_DIRECTOR_ITEM_ID, SPOTTER], true).state()
    const noDirector = rigWith([PERISCOPE, SPOTTER], true).state()
    expect(playerTurretShapeOf(noPeriscope, PLAYER)).toEqual(directorShape())
    expect(playerTurretShapeOf(noDirector, PLAYER)).toBeNull()
  })

  it('asks nothing before the guns are mounted', () => {
    const unmounted = rigWith([FIRE_DIRECTOR_ITEM_ID, PERISCOPE, SPOTTER], false).state()
    expect(playerTurretShapeOf(unmounted, PLAYER)).toBeNull()
  })
})

/** Mark 1 to a few Marks past the module's last. */
function marksOf(itemId: string): number[] {
  const last = lastMarkOf(autoGunsMarkLadderOf(itemId)) + MARKS_PAST_MASTERED
  return Array.from({ length: last }, (_, index) => index + 1)
}
