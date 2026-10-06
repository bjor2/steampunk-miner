/**
 * The scripted runs the golden replays pin (#29 acceptance, #11 acceptance 3, #3 acceptance 1, #5
 * acceptance 3): each is a list of intents at absolute ticks, stamped into authority commands as a
 * client would send them. `npm run golden:update` replays them and writes `tests/golden/`; the
 * golden spec replays the committed command lists, never these builders, so a change to the
 * authority shows as a digest change and not as a silently different script.
 */
import type { AuthorityCommand } from '../authority/authorityCommand'
import {
  corridorCommands,
  setHull,
  setUpgrade,
  spawnEnemy,
} from '../authority/combat/combatFixtures'
import {
  drill,
  GROUND,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  WORLD_SEED,
} from '../authority/scriptedSession'
import type { ScriptedCommand } from '../fastForward'
import { bayPoseAt, dockedPoseAt, FACING } from '../vehicle/vehiclePose'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { familyOfCell, RESOURCE_FAMILY } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import { SECOND_SLICE_GOLDEN_SCRIPTS } from './secondSliceGoldenScripts'

export interface GoldenScript {
  name: string
  /** What the run proves, written into the golden file for whoever reads a failing diff. */
  description: string
  worldSeed: number
  endTick: number
  commands: readonly ScriptedCommand[]
}

/** Band-1 ground breaks in 40 ticks at level 0 (#6: hardness 1, drill power 1.5). */
const BAND_1_TICKS = 40
/** The strand report at tick 12, the 180-tick grace (#7), then a second to see the tow land. */
const STRAND_END_TICK = 12 + 180 + 60
const DESTROY_AND_TOW_TICKS = 300
/** Past the 3600-tick periodic digest, so a golden run pins one of those too. */
const TRIP_END_TICK = 4000
/** Ore here sells for about 5e42 a unit (`V(t) = 10 * 1.5^(t-1)`, #6), so a sale earns past 1e40. */
const RICH_PLANET = 80
/** A cargo_hold level whose next price is about 4e40 (`24 * 1.24^L`, #6), so a purchase spends past 1e40. */
const RICH_CARGO_LEVEL = 420
const RICH_TIP_LEVEL = 240
const RICH_DRILL_LEVEL = 500
const MIXED_ORE_COUNT = 6
/** Enough surface ore of planet 1 to hold three of each family. */
const SURFACE_ORE_SCANNED = 60

export const GOLDEN_SCRIPTS: readonly GoldenScript[] = [
  {
    name: 'dig-and-return',
    description:
      'Planet 1, level 0: drill six surface ore tiles, return to the pad, dock, sell all, undock (#7).',
    worldSeed: WORLD_SEED,
    endTick: TRIP_END_TICK,
    commands: digAndReturnCommands(),
  },
  {
    name: 'strand-and-rescue',
    description:
      'Energy set to 0.05, drive off the pad until it runs out, stranded, towed after the grace (#7).',
    worldSeed: WORLD_SEED,
    endTick: STRAND_END_TICK,
    commands: [
      { tick: 0, type: 'debug.setEnergy', payload: { energy: '0.05' } },
      { tick: 12, ...poseAbove(GROUND, FACING.right, { driveTicks: 12 }) },
    ],
  },
  destroyedAndTowedScript(),
  {
    name: 'money-past-1e40',
    description:
      'Planet 80 ore sold for more than 1e40, then a cargo_hold level bought for more than 1e40 (#5, #11).',
    worldSeed: WORLD_SEED,
    endTick: 2000,
    commands: moneyPast1e40Commands(planetParamsFor(WORLD_SEED, RICH_PLANET)),
  },
  {
    name: 'mined-order-mixed',
    description:
      'Planet 1, level 0: drill metal, crystal, crystal, metal, crystal, metal surface ore; the ' +
      'replay must mine the same ores in the same order (#122).',
    worldSeed: WORLD_SEED,
    endTick: 1 + MIXED_ORE_COUNT * (BAND_1_TICKS + 1) + 60,
    commands: mineTilesFrom(1, mixedOreTiles()),
  },
  ...SECOND_SLICE_GOLDEN_SCRIPTS,
]

/** Stamps a script as one player's client would: `seq` from 1, in order. */
export function stampScript(script: GoldenScript, playerId = 'p1'): AuthorityCommand[] {
  return script.commands.map(
    ({ tick, ...intent }, index) =>
      ({ playerId, tick, seq: index + 1, ...intent }) as AuthorityCommand,
  )
}

function digAndReturnCommands(): ScriptedCommand[] {
  return [
    ...mineTilesFrom(1, surfaceOreTiles(6)),
    ...homeAndSellAt(1 + 6 * (BAND_1_TICKS + 1), planetParamsFor(WORLD_SEED, 1)),
  ]
}

/** Surface ore of planet 1 whose families alternate unevenly, so a reordering shows (#122). */
function mixedOreTiles(): TilePoint[] {
  const ore = surfaceOreTiles(SURFACE_ORE_SCANNED)
  const [metal, crystal] = [RESOURCE_FAMILY.metal, RESOURCE_FAMILY.crystal].map((family) =>
    ore.filter((tile) => familyOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === family),
  )
  return [metal[0], crystal[0], crystal[1], metal[1], crystal[2], metal[2]]
}

/** One tile at a time: stand over it, then drill it for long enough to break it. */
function mineTilesFrom(firstTick: number, tiles: readonly TilePoint[]): ScriptedCommand[] {
  return tiles.flatMap((tile, index) => {
    const tick = firstTick + index * (BAND_1_TICKS + 1)
    return [
      { tick, ...poseAbove(tile, FACING.down) },
      { tick: tick + BAND_1_TICKS, ...drill(tile, BAND_1_TICKS) },
    ]
  })
}

function homeAndSellAt(tick: number, params: PlanetParams): ScriptedCommand[] {
  const home = dockedPoseAt(dockSiteOf(params))
  const { payload } = poseAbove(GROUND, FACING.right)
  return [
    { tick, type: 'reportPose', payload: { ...payload, ...home } },
    { tick, type: 'dock', payload: { bay: 'sell' } },
    { tick: tick + 30, type: 'sellCargo', payload: { resourceTier: 'all' } },
    { tick: tick + 60, type: 'undock', payload: {} },
  ]
}

/** The #25 rear-hit death: hull 1 in the band-1 corridor, a crawler behind, then the tow. */
function destroyedAndTowedScript(): GoldenScript {
  const corridor = corridorCommands(FACING.left)
  const start = corridor[corridor.length - 1].tick
  return {
    name: 'destroyed-and-towed',
    description:
      'Hull set to 1 in the band-1 corridor, a crawler hits the rear, destroyed, towed (#9).',
    worldSeed: WORLD_SEED,
    endTick: start + DESTROY_AND_TOW_TICKS,
    commands: [
      ...corridor.map(({ tick, intent }) => ({ tick, ...intent }) as ScriptedCommand),
      { tick: start, ...setHull('1') },
      { tick: start, ...spawnEnemy('crawler', 1, 3) },
    ] as ScriptedCommand[],
  }
}

function moneyPast1e40Commands(params: PlanetParams): ScriptedCommand[] {
  const levels = [
    setUpgrade('drill_tip', RICH_TIP_LEVEL),
    setUpgrade('drill_power', RICH_DRILL_LEVEL),
    setUpgrade('cargo_hold', RICH_CARGO_LEVEL),
  ]
  const tripEnd = 1 + 3 * (BAND_1_TICKS + 1)
  return [
    { tick: 0, type: 'debug.setPlanet', payload: { planetIndex: params.planetIndex } },
    ...levels.map((intent) => ({ tick: 0, ...intent }) as ScriptedCommand),
    ...mineTilesFrom(1, surfaceOreTiles(3, params)),
    ...homeAndSellAt(tripEnd, params).slice(0, 3),
    ...dockInUpgradeBayAt(tripEnd + 40, params),
    { tick: tripEnd + 45, type: 'buyUpgrade', payload: { upgradeId: 'cargo_hold' } },
  ]
}

/** Upgrades are bought at the Upgrade bay (#37): leave the Sell bay, drive over, dock. */
function dockInUpgradeBayAt(tick: number, params: PlanetParams): ScriptedCommand[] {
  const bay = bayPoseAt(dockSiteOf(params), 'upgrade')
  const { payload } = poseAbove(GROUND, FACING.right)
  return [
    { tick, type: 'undock', payload: {} },
    { tick: tick + 2, type: 'reportPose', payload: { ...payload, ...bay, driveTicks: 2 } },
    { tick: tick + 2, type: 'dock', payload: { bay: 'upgrade' } },
  ]
}
