import { describe, expect, it } from 'vitest'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { FIRE_EAST, PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import { SHOT_SHAPE_CAPS, shotShapeOf } from '../../../systems/authority/bore/shotShape'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { ofType } from '../../../systems/authority/charges/chargeFixtures'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { boreGunOf, gunRecoveryTicks } from '../../../systems/registries/boreGun'
import { setLiningTypeCommand } from '../../../systems/vehicle/vehicleCommands'
import { lastMarkOf } from '../../tech-tree'
import {
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  GIMBAL_SIGHT_ITEM_ID,
  LONG_BARREL_ITEM_ID,
  markLadderOf,
  RIFLED_BORE_ITEM_ID,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
} from './boreGunLane'
import { boreGunStatsOf, wallLevels } from './boreGunProvider'
import { GROUND_GUN } from './groundGunEconomy'
import { moduleStatsAt } from './armouryModules'
import { signatureModuleIds, splayOffsetsOf } from './signatureShapes'

const PLAYER = 'p1'
const FIRE_TICK = 10
const ALL_SIGNATURES = [
  SPLAY_CHOKE_ITEM_ID,
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  RIFLED_BORE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
]
const EVERY_MODULE = [
  ...ALL_SIGNATURES,
  GIMBAL_SIGHT_ITEM_ID,
  STEAM_SEAR_ITEM_ID,
  LONG_BARREL_ITEM_ID,
]

const mountAtWalls: CommandIntent = { type: 'debug.ground-gun.setLevels', payload: wallLevels() }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } }
}

/** A gun at its walls in planet 1's rock pocket, owning `owned`, the tree researched to `planet`. */
function gunWith(owned: readonly string[], planet = 1, isMounted = true): ScriptedSession {
  const session = createScriptedSession()
  if (isMounted) session.submit(0, mountAtWalls)
  session.submit(0, own(owned))
  session.submit(0, researchThrough(planet))
  standInPocket(session, PLAIN_RIG, 0)
  session.advanceTo(1)
  return session
}

function shapeOf(session: ScriptedSession) {
  return shotShapeOf(session.state(), PLAYER)
}

/** Fires east at `tick` and runs the clock until the gun would fire again. */
function fireEastAt(session: ScriptedSession, tick: number): void {
  session.submit(tick, FIRE_EAST)
  session.advanceTo(tick + 1)
}

function chargeEventsOf(session: ScriptedSession) {
  return ofType(session.events(), 'ground-gun.ModuleChargeSpent').map(
    ({ itemId, chargesLeft }) => ({ itemId, chargesLeft }),
  )
}

describe('ground-gun: the signature modules shape the shot (ticket 380, #377 shotShapeOf)', () => {
  it('shapes nothing while the gun is not mounted, whatever modules the player owns', () => {
    expect(shapeOf(gunWith(ALL_SIGNATURES, 40, false))).toBeNull()
    expect(boreGunOf(gunWith(ALL_SIGNATURES, 40, false).state(), PLAYER)).toBeNull()
  })

  it('bores one plain line with no signature module on the gun', () => {
    expect(shapeOf(gunWith([GIMBAL_SIGHT_ITEM_ID, LONG_BARREL_ITEM_ID], 40))).toBeNull()
  })

  it('splits the splay choke into its lines, the aimed one and the rest to either side in turn', () => {
    expect(splayOffsetsOf(2, 8)).toEqual([8])
    expect(splayOffsetsOf(5, -8)).toEqual([-8, 8, -16, 16])
    expect(shapeOf(gunWith([SPLAY_CHOKE_ITEM_ID]))).toMatchObject({ lineOffsets: [-8] })
  })

  it('turns each line along its seam as often as the rifled bore allows', () => {
    expect(shapeOf(gunWith([RIFLED_BORE_ITEM_ID], 33))).toMatchObject({
      lineOffsets: [],
      seamTurns: 1,
    })
  })

  it("keeps every module's lines and turns inside the kernel's caps at every Mark", () => {
    const linesAndTurns = (mark: number) => [
      moduleStatsAt(SPLAY_CHOKE_ITEM_ID, mark).stats.splayLines,
      moduleStatsAt(RIFLED_BORE_ITEM_ID, mark).stats.rifleTurns,
    ]
    const lastMark = Math.max(
      lastMarkOf(markLadderOf(SPLAY_CHOKE_ITEM_ID)),
      lastMarkOf(markLadderOf(RIFLED_BORE_ITEM_ID)),
    )
    const marks = Array.from({ length: lastMark + 5 }, (_, at) => at + 1)
    expect(
      marks
        .map(linesAndTurns)
        .filter(
          ([lines, turns]) =>
            lines > SHOT_SHAPE_CAPS.maxLines || turns > SHOT_SHAPE_CAPS.maxSeamTurns,
        ),
    ).toEqual([])
    expect(linesAndTurns(lastMark + 4)).toEqual([
      SHOT_SHAPE_CAPS.maxLines,
      SHOT_SHAPE_CAPS.maxSeamTurns,
    ])
  })

  it('folds every module into one shape: the strongest of each, never a sum', () => {
    const session = gunWith(ALL_SIGNATURES)
    session.submit(1, setLiningTypeCommand('refractory'))
    session.advanceTo(2)
    expect(shapeOf(session)).toEqual({
      lineOffsets: [-8],
      seamTurns: 1,
      liningGrade: 'refractory_lining',
      extraEnergyPerCellBp: 10000,
      groundTicks: 600,
      strutTicks: 600,
    })
  })

  it('leaves the cementing round idle with no cement-grade lining to lay', () => {
    expect(shapeOf(gunWith([CEMENTING_ROUND_ITEM_ID], 23))).toBeNull()
  })

  it('keeps the shot budget and the reach cap of 10 whatever the gun carries, at any Mark', () => {
    const session = gunWith(EVERY_MODULE, 60)
    const gun = boreGunOf(session.state(), PLAYER)
    expect(gun?.boreBudgetTicks).toBe(GROUND_GUN.bore.shotDigTicks)
    expect(gun?.rangeCells).toBeLessThanOrEqual(10)
  })

  it('adds the larger of the splay and rifle cadence to the least wait, never their sum', () => {
    const plain = boreGunStatsOf(wallLevels())?.cooldownTicks ?? 0
    const cooldownOf = (owned: readonly string[]) =>
      boreGunOf(gunWith(owned).state(), PLAYER)?.cooldownTicks
    expect(cooldownOf([SPLAY_CHOKE_ITEM_ID])).toBe(plain + 15)
    expect(cooldownOf([SPLAY_CHOKE_ITEM_ID, RIFLED_BORE_ITEM_ID])).toBe(plain + 15)
    expect(cooldownOf([CEMENTING_ROUND_ITEM_ID, STRUT_BORE_ITEM_ID])).toBe(plain)
  })

  it('recovers a shaped shot by the one gunRecoveryTicks, from the dig ticks all its lines spent', () => {
    const session = gunWith(ALL_SIGNATURES, 40)
    session.submit(FIRE_TICK, FIRE_EAST)
    session.advanceTo(FIRE_TICK + 5)
    const bores = session.state().bores ?? []
    const [{ shot, budgetLeft, nextShotTick }] = bores
    const spent = shot.boreBudgetTicks - budgetLeft
    expect(spent).toBeGreaterThan(0)
    expect(shot.boreBudgetTicks).toBe(GROUND_GUN.bore.shotDigTicks)
    expect(bores.every((bore) => bore.nextShotTick === nextShotTick)).toBe(true)
    expect(nextShotTick).toBe(FIRE_TICK + gunRecoveryTicks(spent, shot))
  })

  it('lists the five signature modules in the lane order', () => {
    expect(signatureModuleIds()).toEqual(ALL_SIGNATURES)
  })
})

describe('ground-gun: charged modules spend per shot and restock at the dock (ticket 380)', () => {
  it('spends a cementing round per cemented shot, then waits its cooldown before the next', () => {
    const session = gunWith([CEMENTING_ROUND_ITEM_ID], 23)
    session.submit(1, setLiningTypeCommand('refractory'))
    fireEastAt(session, FIRE_TICK)
    expect(chargeEventsOf(session)).toEqual([{ itemId: CEMENTING_ROUND_ITEM_ID, chargesLeft: 2 }])
    expect(shapeOf(session)).toBeNull()
    session.advanceTo(FIRE_TICK + 120)
    expect(shapeOf(session)).toMatchObject({ liningGrade: 'refractory_lining' })
  })

  it('runs the cementing round dry after its charges, until the dock restocks them', () => {
    const session = gunWith([CEMENTING_ROUND_ITEM_ID], 23)
    session.submit(1, setLiningTypeCommand('refractory'))
    for (const tick of [FIRE_TICK, FIRE_TICK + 200, FIRE_TICK + 400]) fireEastAt(session, tick)
    session.advanceTo(FIRE_TICK + 600)
    expect(chargeEventsOf(session).map(({ chargesLeft }) => chargesLeft)).toEqual([2, 1, 0])
    expect(shapeOf(session)).toBeNull()
  })

  it('grounds a line at most once every groundCooldownTicks', () => {
    const session = gunWith([EARTHING_SPIKE_ITEM_ID], 28)
    expect(shapeOf(session)).toMatchObject({ groundTicks: 600 })
    fireEastAt(session, FIRE_TICK)
    expect(shapeOf(session)).toBeNull()
    session.advanceTo(FIRE_TICK + 300)
    expect(shapeOf(session)).toMatchObject({ groundTicks: 600 })
  })
})
