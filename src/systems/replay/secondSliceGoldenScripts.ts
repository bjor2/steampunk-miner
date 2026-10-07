/**
 * The second slice's golden runs (S11, #65): casing, collapse, the two bays and the artefact cache,
 * pinned by digest like the first slice's (#11 section 3, #29). Each is a list of intents at
 * absolute ticks on the scripted session's planet 1; `goldenScripts.ts` stamps and records them.
 * What each run must show besides its digests is checked by `secondSliceGolden.test.ts`.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { blockContaining, blockIdOf } from '../world/collapseBlock'
import { artefactCacheTile } from '../world/artefactCache'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import type { BayId } from '../world/dockBays'
import type { TilePoint } from '../world/tileGrid'
import type { CommandIntent } from '../authority/authorityCommand'
import { BAND_2_Y, diggerIntents, digPoses, poseAt } from '../authority/collapse/collapseFixtures'
import { forceCollapseCommand } from '../authority/collapse/collapseCommands'
import { FREEZE_ENEMIES, GROUND, poseAbove, WORLD_SEED } from '../authority/scriptedSession'
import type { ScriptedCommand } from '../fastForward'
import { bayPoseAt, FACING } from '../vehicle/vehiclePose'
import type { GoldenScript } from './goldenScripts'

/** The band-2 dig of the collapse specs (#43 acceptance 3): 8 m east through cave-free rock. */
const DIG_FROM_X = -31500
const DIG_TO_X = -23500
/** Back 4 m along the bore without drilling, past the lined blocks behind the face. */
const BACK_TO_X = -27500
/** Ten seconds beside the bore: long past a 60-tick warning and its 30-tick refill. */
const PARK_TICKS = 600
const PARK_EVERY_TICKS = 60
/** The planet 1 cache sits in band 3 (#46), where crawlers spawn; they are frozen first. */
const CACHE_PLANET_1 = artefactCacheTile(planetParamsFor(WORLD_SEED, 1))
const CACHE_PLANET_2 = artefactCacheTile(planetParamsFor(WORLD_SEED, 2))

export const SECOND_SLICE_GOLDEN_SCRIPTS: readonly GoldenScript[] = [
  casingDigScript({
    name: 'casing-lined-band-2',
    description:
      'Grade 2 digs 8 m into band 2 and parks beside its lining: no collapse; then ' +
      'debug.forceCollapse refills a lined block anyway (#41, #43).',
    casingGrade: 2,
    forcedBlock: blockIdOf(blockContaining({ xMm: BACK_TO_X, yMm: BAND_2_Y })),
  }),
  casingDigScript({
    name: 'collapse-band-2-grade-1',
    description:
      'Grade 1 digs 8 m into band 2: the lined blocks behind warn for 60 ticks and refill (#43).',
    casingGrade: 1,
    forcedBlock: null,
  }),
  {
    name: 'two-bays-wrong-bay',
    description:
      'Buying at the Sell bay and selling at the Upgrade bay are refused as wrong_bay; the same ' +
      'buys at the Upgrade bay apply (#37, #41).',
    worldSeed: WORLD_SEED,
    endTick: 120,
    commands: twoBaysCommands(),
  },
  {
    name: 'artefact-live-and-husk',
    description:
      'Take assay_beacon from the live planet 1 cache; on planet 2 the cache is a husk and ' +
      'opening it is refused (#46).',
    worldSeed: WORLD_SEED,
    endTick: 60,
    commands: artefactCommands(),
  },
]

interface CasingDig {
  name: string
  description: string
  casingGrade: number
  /** A block forced to collapse after the park, or null for none. */
  forcedBlock: string | null
}

function casingDigScript({ name, description, casingGrade, forcedBlock }: CasingDig): GoldenScript {
  const dig = digPoses(1, BAND_2_Y, DIG_FROM_X, DIG_TO_X)
  const back = digPoses(nextTickAfter(dig), BAND_2_Y, DIG_TO_X, BACK_TO_X, 0)
  const park = parkPoses(nextTickAfter(back), BACK_TO_X)
  const forced = forcedCollapseAt(nextTickAfter(park), forcedBlock)
  const commands = [...atTick(0, diggerIntents(casingGrade)), ...dig, ...back, ...park, ...forced]
  return { name, description, worldSeed: WORLD_SEED, endTick: lastTickOf(commands) + 120, commands }
}

function parkPoses(firstTick: number, x: number): ScriptedCommand[] {
  return Array.from({ length: PARK_TICKS / PARK_EVERY_TICKS }, (_, at) => ({
    tick: firstTick + at * PARK_EVERY_TICKS,
    ...poseAt(x, BAND_2_Y),
  }))
}

function forcedCollapseAt(tick: number, block: string | null): ScriptedCommand[] {
  return block === null ? [] : [{ tick, ...forceCollapseCommand(block) }]
}

function twoBaysCommands(): ScriptedCommand[] {
  return [
    { tick: 0, type: 'debug.grantMoney', payload: { amount: '1000' } },
    ...dockAt(1, 'sell'),
    { tick: 2, type: 'buyUpgrade', payload: { upgradeId: 'drill_tip', chain: 0 } },
    { tick: 3, type: 'buyCasingGrade', payload: { chain: 0 } },
    { tick: 10, type: 'undock', payload: {} },
    ...dockAt(12, 'upgrade'),
    { tick: 13, type: 'sellCargo', payload: { resourceTier: 'all' } },
    { tick: 14, type: 'buyUpgrade', payload: { upgradeId: 'drill_tip', chain: 0 } },
    { tick: 15, type: 'buyCasingGrade', payload: { chain: 0 } },
  ]
}

/** At rest in a bay's pad zone, then `Dock {bay}`. */
function dockAt(tick: number, bay: BayId): ScriptedCommand[] {
  const { payload } = poseAbove(GROUND, FACING.right)
  const rest = bayPoseAt(dockSiteOf(planetParamsFor(WORLD_SEED, 1)), bay)
  return [
    { tick, type: 'reportPose', payload: { ...payload, ...rest } },
    { tick, type: 'dock', payload: { bay } },
  ]
}

function artefactCommands(): ScriptedCommand[] {
  const open: CommandIntent = { type: 'openArtefactCache', payload: {} }
  return [
    { tick: 1, ...FREEZE_ENEMIES },
    { tick: 2, ...poseOnTile(CACHE_PLANET_1) },
    { tick: 3, ...open },
    { tick: 4, type: 'chooseArtefact', payload: { optionId: 'artefact.assay_beacon' } },
    { tick: 5, type: 'debug.setPlanet', payload: { planetIndex: 2 } },
    { tick: 6, ...FREEZE_ENEMIES },
    { tick: 7, ...poseOnTile(CACHE_PLANET_2) },
    { tick: 8, ...open },
  ] as ScriptedCommand[]
}

/** At rest on a tile's centre, facing down. */
function poseOnTile(tile: TilePoint): CommandIntent<'reportPose'> {
  const centre = (index: number) => index * MM_PER_METRE + MM_PER_METRE / 2
  return poseAt(centre(tile.tx), centre(tile.ty), 0, FACING.down)
}

function atTick(tick: number, intents: readonly CommandIntent[]): ScriptedCommand[] {
  return intents.map((intent) => ({ tick, ...intent }) as ScriptedCommand)
}

function nextTickAfter(commands: readonly ScriptedCommand[]): number {
  return lastTickOf(commands) + 12
}

function lastTickOf(commands: readonly ScriptedCommand[]): number {
  return commands[commands.length - 1].tick
}
