import { describe, expect, it } from 'vitest'
import { boreCellEnergy } from '../../../systems/authority/bore/boreCell'
import {
  FIRE_EAST,
  lineEastOf,
  PLAIN_RIG,
  standInPocket,
} from '../../../systems/authority/bore/boreFixtures'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { ticksPerCell } from '../../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { oreHardness } from '../../../systems/economy/oreEconomy'
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { WHOLE_BP } from '../../../systems/registries/boreGun'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { ticksPerTile } from '../../../systems/vehicle/drillRule'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { boreGunStatsOf } from './boreGunProvider'
import { GROUND_GUN, GUN_TRACK_IDS } from './groundGunEconomy'
import { UNMOUNTED_GUN, type GunLevels } from './gunLevels'
import { boreShotOnGround, gunRecoveryTicks, gunTicksPerCell } from './gunRecovery'
import { energyStatsAt, penetrationStatsAt, rateStatsAt, wallLevelOf } from './gunTracks'

/**
 * Systems' budget on #309 (point 2) and its test (a) on #310: "L1, L5 and max level on bands 1, 5
 * and 9". A planet has five bands (6 names the core), so the three grounds are ore tiers 1, 5 and
 * 9: soft, middling and hard rock as the shared dig function sees it.
 */
const GUN_LEVELS = [1, 5, 'max'] as const
const GROUND_TIERS = [1, 5, 9]
/** The on-curve drill of the #310 pace planets: "the same level" as the gun's owner. */
const DRILL_PLANETS = [1, 4, 7, 10]
const FIRE_TICK = 10

function levelsAt(level: (typeof GUN_LEVELS)[number]): GunLevels {
  const at = (trackId: (typeof GUN_TRACK_IDS)[number]) =>
    level === 'max' ? wallLevelOf(trackId) : Math.min(level, wallLevelOf(trackId))
  return { rate: at('rate'), penetration: at('penetration'), energy: at('energy') }
}

/** One full recovery's cells over its ticks against the drill's one cell over its ticks. */
function throughputOf(levels: GunLevels, drillPlanet: number, tier: number) {
  const drill = vehicleStatsAt(onCurveSteps(drillPlanet))
  const hardness = oreHardness(tier)
  const gunTicks = gunTicksPerCell(
    drill,
    penetrationStatsAt(levels.penetration).gunFactorPct,
    hardness,
  )
  const shot = boreShotOnGround(GROUND_GUN.bore.boreRangeBase, gunTicks)
  return {
    gunCells: shot.cells,
    recoveryTicks: gunRecoveryTicks(shot.spentDigTicks, rateStatsAt(levels.rate)),
    drillTicksPerCell: ticksPerTile(drill, hardness),
  }
}

const setLevels = (levels: GunLevels): CommandIntent => ({
  type: 'debug.ground-gun.setLevels',
  payload: { ...levels },
})

/** A planet-1 session whose rig holds `levels` and stands in its rock pocket. */
function armedRigAt(rig: TilePoint, levels: GunLevels): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setLevels(levels))
  standInPocket(session, rig, 0)
  return session
}

function drillTicksOfCell(session: ScriptedSession, tile: TilePoint): number {
  const drill = heatThrottledDrill(1, session.vehicle())
  return ticksPerCell(drill, PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile)) as number
}

const boredTilesOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'TileDestroyed' && event.cause === 'bore')

describe('ground-gun: the bore never out-digs the drill (#309 Systems budget)', () => {
  it.each(GUN_LEVELS)(
    'bores at most 0.5x the drill cells a second over a full recovery at gun level %s on ground tiers 1, 5 and 9',
    (level) => {
      let boredGrounds = 0
      for (const drillPlanet of DRILL_PLANETS) {
        for (const tier of GROUND_TIERS) {
          const { gunCells, recoveryTicks, drillTicksPerCell } = throughputOf(
            levelsAt(level),
            drillPlanet,
            tier,
          )
          if (drillTicksPerCell === null) expect(gunCells).toBe(0)
          // gunCells / recoveryTicks <= 0.5 / drillTicksPerCell, in whole numbers.
          else expect(2 * gunCells * drillTicksPerCell).toBeLessThanOrEqual(recoveryTicks)
          if (gunCells > 0) boredGrounds++
        }
      }
      expect(boredGrounds).toBeGreaterThan(0)
    },
  )

  // The VS's P40 case (TD and GD on #314): P40's own bands 1, 5 and 9 with the rig at the bot's
  // #307 arrival drill level, the gun at the bot's emergent levels and at the max levels a P40
  // economy affords. On today's tiers it would only measure the 24-tick cap, so it waits for the
  // drill.sweptCut flag flip and the #304/#330 re-baseline.
  it.todo(
    'bores at most 0.5x the drill on P40 bands 1, 5 and 9 at the #307 arrival drill (drill.sweptCut flip, #304/#330 re-baseline)',
  )

  it('asks at least the drill dig energy for every cell at every energy level', () => {
    for (let level = 1; level <= wallLevelOf('energy'); level++) {
      expect(energyStatsAt(level).energyPerCellPct * 100).toBeGreaterThanOrEqual(WHOLE_BP)
      const drillTicks = 24
      expect(
        boreCellEnergy(drillTicks, energyStatsAt(level).energyPerCellPct * 100),
      ).toBeGreaterThanOrEqual(drillTicks * ENERGY_QUANTA_PER_TICK.drill)
    }
  })

  it('debits each bored cell at least its drill energy in play, at the first and the wall level', () => {
    for (const level of [1, 'max'] as const) {
      const session = armedRigAt(PLAIN_RIG, levelsAt(level))
      const before = session.vehicle().energy
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 20)
      const bored = boredTilesOf(session.events()) as { tx: number; ty: number }[]
      const drillEnergy = bored
        .map((tile) => drillTicksOfCell(session, tile) * ENERGY_QUANTA_PER_TICK.drill)
        .reduce((sum, energy) => sum + energy, 0)
      expect(bored.length).toBeGreaterThan(0)
      expect(before - session.vehicle().energy).toBeGreaterThanOrEqual(drillEnergy)
    }
  })
})

describe('ground-gun: the gun the kernel fires', () => {
  it('has no gun before the mount', () => {
    expect(boreGunStatsOf(UNMOUNTED_GUN)).toBeNull()
  })

  it("answers the levels' numbers in whole ticks and basis points", () => {
    expect(boreGunStatsOf({ rate: 1, penetration: 1, energy: 1 })).toEqual({
      rangeCells: 4,
      openIntervalTicks: 2,
      cooldownTicks: 45,
      kGunPct: 25,
      gunFactorBp: 4900,
      boreBudgetTicks: 90,
      energyPerCellBp: 19800,
      collapseHoldTicks: 30,
    })
    expect(boreGunStatsOf(levelsAt('max'))).toMatchObject({
      cooldownTicks: 15,
      kGunPct: 45,
      gunFactorBp: 10000,
      energyPerCellBp: 10000,
    })
  })

  it('refuses a shot before the mount and bores the line east once mounted', () => {
    const unarmed = armedRigAt(PLAIN_RIG, UNMOUNTED_GUN)
    unarmed.submit(FIRE_TICK, FIRE_EAST)
    expect(unarmed.events().find((event) => event.type === 'CommandRejected')).toMatchObject({
      reason: 'no_bore_gun',
    })
    const armed = armedRigAt(PLAIN_RIG, levelsAt('max'))
    armed.submit(FIRE_TICK, FIRE_EAST)
    armed.advanceTo(FIRE_TICK + 20)
    const bored = boredTilesOf(armed.events()).map((event) => event as { tx: number; ty: number })
    expect(bored.map(({ tx, ty }) => ({ tx, ty }))).toEqual(
      lineEastOf(PLAIN_RIG).slice(0, bored.length),
    )
    expect(bored.length).toBeGreaterThan(0)
  })
})
