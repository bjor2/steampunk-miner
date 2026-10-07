/**
 * A haul for the browser specs and the review clips (#176), as a script for `fastForward`: scripted
 * mining of each leg's surface ore with the same authority commands the golden runs play, then a
 * dock at the Exchange. The spec waits for the bay to open and sells, so the burst plays as a
 * player's sale does. Scripted mining lines its tiles as a player's drill does (#115), so the first
 * sale pays a lining bill. It only writes the script: the spec submits it, so it replays and logs
 * like any `fastForward`.
 */
import {
  drill,
  FREEZE_ENEMIES,
  poseAbove,
  surfaceOreTiles,
  WORLD_SEED,
} from '../../systems/authority/scriptedSession'
import { stepOfMajor } from '../../systems/economy/upgradeSteps'
import type { ScriptedCommand } from '../../systems/fastForward'
import { setPlanetCommand, setPlanetSeedCommand } from '../../systems/startScenarioCommands'
import { bayPoseAt, FACING } from '../../systems/vehicle/vehiclePose'
import { dockSiteOf } from '../../systems/world/dockSite'
import { planetParamsFor } from '../../systems/world/planetParams'

/** Each leg mines `tiles` surface ore tiles of its planet, in order; the last leg's pad docks. */
export type HaulPlan = readonly { planet: number; tiles: number }[]

export interface HaulScript {
  commands: ScriptedCommand[]
  /** The tick of the script's last command, where the `fastForward` should end. */
  endTick: number
}

const TICKS_PER_TILE = 50
const DRILL_TICKS = 40
const MOST_TILES_PER_LEG = 40

export function haulScriptOf(legs: HaulPlan, firstTick: number): HaulScript {
  const opening: HaulScript = {
    commands: [
      { tick: firstTick, ...FREEZE_ENEMIES },
      { tick: firstTick, ...setPlanetSeedCommand(WORLD_SEED) },
    ],
    endTick: firstTick,
  }
  const mined = legs.reduce((script, leg) => withLeg(script, leg.planet, leg.tiles), opening)
  return withDocking(mined, legs[legs.length - 1].planet)
}

/** Why a haul plan from a browser spec is refused (refused, never trimmed): every problem. */
export function haulPlanProblems(legs: unknown): string[] {
  if (!Array.isArray(legs) || legs.length === 0) return ['the haul must list at least one leg']
  return legs.flatMap((leg, index) =>
    isLeg(leg) ? [] : [`leg ${index} needs a planet >= 1 and 1 to ${MOST_TILES_PER_LEG} tiles`],
  )
}

/**
 * The drill a planet's surface ore needs, as the authority's later-planet specs set it: whole
 * majors, stored as their step (#181).
 */
function legSetupAt(tick: number, planet: number): ScriptedCommand[] {
  const toPlanet: ScriptedCommand[] = [
    { tick, ...setPlanetCommand(planet) },
    { tick, ...setPlanetSeedCommand(WORLD_SEED) },
  ]
  return [
    ...(planet === 1 ? [] : toPlanet),
    {
      tick,
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_power', level: 25 + planet * 6 },
    },
    {
      tick,
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_tip', level: stepOfMajor(13 + planet * 3) },
    },
  ]
}

function withLeg(script: HaulScript, planet: number, tiles: number): HaulScript {
  const start = script.endTick
  const params = planetParamsFor(WORLD_SEED, planet)
  const mining = surfaceOreTiles(tiles, params).flatMap((tile, index) => {
    const tick = start + 1 + TICKS_PER_TILE * index
    return [
      { tick, ...poseAbove(tile, FACING.down) },
      { tick: tick + DRILL_TICKS, ...drill(tile, DRILL_TICKS) },
    ]
  })
  return {
    commands: [...script.commands, ...legSetupAt(start, planet), ...mining],
    endTick: start + TICKS_PER_TILE * tiles + 1,
  }
}

function withDocking(script: HaulScript, planet: number): HaulScript {
  const tick = script.endTick
  const site = dockSiteOf(planetParamsFor(WORLD_SEED, planet))
  const { payload } = poseAbove(site.dockPoint, FACING.right)
  const docking: ScriptedCommand[] = [
    { tick, type: 'reportPose', payload: { ...payload, ...bayPoseAt(site, 'sell') } },
    { tick, type: 'dock', payload: { bay: 'sell' } },
  ]
  return { commands: [...script.commands, ...docking], endTick: tick }
}

function isLeg(leg: unknown): boolean {
  if (typeof leg !== 'object' || leg === null) return false
  const { planet, tiles } = leg as { planet?: unknown; tiles?: unknown }
  return (
    isWholeAtLeastOne(planet) && isWholeAtLeastOne(tiles) && (tiles as number) <= MOST_TILES_PER_LEG
  )
}

function isWholeAtLeastOne(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}
