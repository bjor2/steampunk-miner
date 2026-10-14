import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { continueScriptedSession, poseAbove } from '../../../systems/authority/scriptedSession'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { foldDrillGear } from '../../../systems/economy/drillGearCaps'
import { ECONOMY } from '../../../systems/economy/economy'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../../systems/economy/vehicleStats'
import { cmp } from '../../../systems/money'
import { drillGearOf } from '../../../systems/registries/drillGear'
import { contentOf } from '../../../systems/registries/content'
import { setPlanetCommand } from '../../../systems/startScenarioCommands'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { cellDensitySum } from '../../../systems/world/cellYield'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import type { WorldState } from '../../../systems/world/worldState'
import { oreFamilies } from '../../ores'
import { CHOOSE_FORK_COMMAND, FORK_TIER, nodeCostOf } from '../../tech-tree'
import { drillGearAskOf, REACH_BOOM_ID, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import {
  DEEP_BRANCH,
  DRILL_GEAR_FORK,
  WIDE_BRANCH,
  WIDE_LEANED_ROW,
  widenedFlanksOf,
} from './drillGearFork'
import { drillGearItemOf, gearValueOf } from './drillGearItems'
import { TWIN_BIT_ID } from './twinBit'

// The drill-gear lane's P16 fork (GD lock on #255, build 3, ticket 268): Wide cuts the flanks,
// Deep the cell below the bit, each only while it is the lane's active branch.

const PLAYER = 'p1'
const SEED = 83921
const DRILL_TICKS = 60
const PARAMS_16 = planetParamsFor(SEED, FORK_TIER)
/** The tile under a miner sunk into the planet-16 surface, away from the pad. */
const TARGET_16: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS_16.radiusTiles) - 1 }

/** Player `p1` on planet 16 with the on-curve drill, its lane fork chosen as `branch`, if any. */
function sessionOnForkPlanet(branch: string | null) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: [PLAYER] })
  const session = continueScriptedSession(start)
  const setup: CommandIntent[] = [
    setPlanetCommand(FORK_TIER),
    { type: 'debug.setMoney', payload: { amount: '1e30' } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, FORK_TIER)))),
    ...(branch === null ? [] : [chooseDrillBranch(branch)]),
  ]
  setup.forEach((intent) => session.submit(0, intent))
  return session
}

function chooseDrillBranch(branch: string): CommandIntent {
  return { type: CHOOSE_FORK_COMMAND, payload: { lane: 'drill-gear', branch } } as CommandIntent
}

/** The gear the player's drill cuts with, facing `facing` into the planet-16 surface. */
function gearFacing(branch: string | null, facing: Facing) {
  const session = sessionOnForkPlanet(branch)
  session.submit(1, poseAbove(TARGET_16, facing))
  return drillGearOf(session.state(), PLAYER)
}

/** What one downward drill command into the planet-16 surface leaves of the ground. */
function worldAfterCutDown(branch: string | null): WorldState {
  const session = sessionOnForkPlanet(branch)
  session.submit(1, poseAbove(TARGET_16, FACING.down))
  session.submit(1 + DRILL_TICKS, poseAbove(TARGET_16, FACING.down, { drillTicks: DRILL_TICKS }))
  return session.state().world
}

/** Five columns either side of the bit and four rows down from the miner's row. */
function tilesNearSurface(): TilePoint[] {
  return Array.from({ length: 11 * 5 }, (_, index) => ({
    tx: TARGET_16.tx - 5 + (index % 11),
    ty: TARGET_16.ty + 1 - Math.floor(index / 11),
  }))
}

/** The tiles the branch's cut took more of than the bare drill's did. */
function tilesCutBeyondBare(branch: string): TilePoint[] {
  const bare = worldAfterCutDown(null)
  const forked = worldAfterCutDown(branch)
  const densityIn = (world: WorldState, tile: TilePoint) => cellDensitySum(world, PARAMS_16, tile)
  return tilesNearSurface().filter((tile) => densityIn(forked, tile) < densityIn(bare, tile))
}

describe('drill-gear fork: Wide and Deep', () => {
  it('registers the pair as two P16 capability nodes that unlock no store item', () => {
    const nodes = contentOf('tech-node').filter((node) =>
      node.id.startsWith('tech.drill_gear.fork.'),
    )
    expect(nodes.map((node) => node.id).sort()).toEqual([
      'tech.drill_gear.fork.deep',
      'tech.drill_gear.fork.wide',
    ])
    expect(nodes.every((node) => node.unlockTier === 16 && node.costKind === 'capability')).toBe(
      true,
    )
    const storeItems = new Set(contentOf('vehicle-item').map((item) => item.id))
    expect(nodes.filter((node) => storeItems.has(node.unlocks))).toEqual([])
  })

  it('prices both branches the same on P16-P60', () => {
    const [wide, deep] = DRILL_GEAR_FORK.branches
    const planets = Array.from({ length: 45 }, (_, index) => FORK_TIER + index)
    const unequal = planets.filter(
      (planet) => cmp(nodeCostOf(wide.id, planet)!, nodeCostOf(deep.id, planet)!) !== 0,
    )
    expect(unequal).toEqual([])
  })

  it('asks nothing of the drill before the lane chooses', () => {
    expect(gearFacing(null, FACING.down)).toBeNull()
    expect(gearFacing(null, FACING.right)).toBeNull()
  })

  it('Wide cuts one flank cell on each side at a whole energy share, whatever the facing', () => {
    for (const facing of [FACING.down, FACING.right]) {
      expect(gearFacing(WIDE_BRANCH, facing)).toMatchObject({
        sideCells: 1,
        offSideCells: 1,
        sideEnergyShareBp: 10000,
        aheadCells: 0,
      })
    }
  })

  it('Wide adds its flank cell to the switched-on side cutters, keeping their held side', () => {
    expect(widenedFlanksOf(null)).toEqual({ sideCells: 1, sideEnergyShareBp: 10000 })
    const cutters = drillGearAskOf((itemId) => itemId === SIDE_CUTTERS_ID)
    expect(widenedFlanksOf(cutters)).toEqual({ sideCells: 2, sideEnergyShareBp: 10000 })
    const held = {
      ...cutters,
      sideAim: 'drive' as const,
      sideSeed: { x: 1 as const, y: 0 as const },
    }
    expect(widenedFlanksOf(held)).toMatchObject({ sideCells: 2, sideAim: 'drive' })
  })

  it('Wide cuts nothing while its side_drills row is shut', () => {
    const session = sessionOnForkPlanet(WIDE_BRANCH)
    session.submit(1, setPlanetCommand(12))
    session.submit(2, poseAbove(TARGET_16, FACING.down))
    expect(drillGearOf(session.state(), PLAYER)).toBeNull()
  })

  it('Deep cuts the cell past the bit facing down, and nothing facing any other way', () => {
    expect(gearFacing(DEEP_BRANCH, FACING.down)).toMatchObject({
      aheadCells: 1,
      facingAheadCells: 1,
      sideCells: 0,
    })
    expect(gearFacing(DEEP_BRANCH, FACING.right)).toBeNull()
    expect(gearFacing(DEEP_BRANCH, FACING.up)).toBeNull()
  })

  it('Deep stays inside the aheadCells = 1 clamp with the reach boom and twin bit beside it', () => {
    const deep = gearFacing(DEEP_BRANCH, FACING.down)!
    const boom = drillGearAskOf((itemId) => itemId === REACH_BOOM_ID)!
    const twin = { aheadCells: gearValueOf(TWIN_BIT_ID, 'aheadCells'), aheadAim: 'drive' as const }
    const deepAsk = { aheadCells: deep.aheadCells }
    const folded = foldDrillGear([deepAsk, boom, twin], ECONOMY.drillGearCaps)
    expect(ECONOMY.drillGearCaps.aheadCellsMax).toBe(1)
    expect(folded).toMatchObject({ aheadCells: 1, facingAheadCells: 1 })
  })

  it('a Wide cut takes more of both flanks than the bare bore, a Deep cut only the cell below', () => {
    const bit = TARGET_16.tx
    const wide = tilesCutBeyondBare(WIDE_BRANCH)
    expect(wide.map((tile) => tile.tx).sort()).toEqual([bit - 1, bit + 1])
    expect(tilesCutBeyondBare(DEEP_BRANCH)).toEqual([{ tx: bit, ty: TARGET_16.ty - 1 }])
  })

  it('names neither the leaned row nor its side cutters on a card, and no ore family 3-12', () => {
    const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === WIDE_LEANED_ROW)!
    const cutters = drillGearItemOf(SIDE_CUTTERS_ID)!
    const forbidden = [
      row.id,
      row.name,
      cutters.name,
      cutters.iconId,
      cutters.node.iconId,
      ...oreFamilies()
        .slice(2)
        .map((family) => family.name),
    ].map((word) => word.toLowerCase())
    const cards = DRILL_GEAR_FORK.branches.map((node) => JSON.stringify(node).toLowerCase())
    expect(cards.flatMap((card) => forbidden.filter((word) => card.includes(word)))).toEqual([])
  })
})
