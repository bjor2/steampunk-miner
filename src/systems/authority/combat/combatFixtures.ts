/**
 * Places the combat specs fight in (#25), on the scripted planet 1 of `scriptedSession.ts`: a short
 * corridor bored one row under the surface at x = 14..26, in band 1 where no enemy spawns and with
 * no spawn point within 34 tiles, so the only enemies in a fight are the ones a spec spawns.
 * The vehicle stands in the corridor's middle; enemies come along it.
 */
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import { NO_DRIVE } from '../../vehicle/driveSigns'
import type { PlanetParams } from '../../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import { drill, type ScriptedSession } from '../scriptedSession'
import { freezeEnemiesCommand, spawnEnemyCommand } from './combatCommands'
import { spawnPointsWithin } from './spawnPoints'
import type { UpgradeId } from '../../economy/economyDefinition'
import { stepOfLevel } from '../../economy/upgradeSteps'

export const CORRIDOR_ROW = 297
export const CORRIDOR_MIDDLE: TilePoint = { tx: 20, ty: CORRIDOR_ROW }
const CORRIDOR_HALF_LENGTH = 6
/**
 * The drill the corridor is bored with: purchase 33, the first as strong as the major-60 drill it
 * was bored with before drill power grew per purchase (#552).
 */
const BORE_DRILL_LEVEL = 33
/** More than the bore drill needs for a band 1 tile (#6). */
const BORE_TICKS = 30
/**
 * The drill the corridor fights with: purchase 8, the first as strong as planet 1's on-curve
 * major 13 before #552 (6.92 against 6.55). On-curve drill power is now about 2.5x that on planet
 * 1, and combat damage still follows it until the combat damage design of #555, so the fights
 * keep the old on-curve power rather than kill everything in a shot or two.
 */
const FIGHT_DRILL_LEVEL = 8

/**
 * The drill for planet 4's #107 fights: purchase 17, the closest to planet 4's on-curve major 31
 * before #552 (49.0 against 50.3). On-curve drill power is now 21 purchases there, about 2.3x as
 * strong, and a gun shot is still a quarter of it until the combat damage design of #555, so a
 * band-3 enemy would die in three shots: the specs that count shots keep the old on-curve shot.
 */
export const PLANET_4_FIGHT_DRILL_LEVEL = 17

export interface PoseOptions {
  facing: Facing
  vx?: number
  vy?: number
}

/** A pose at a tile's centre, upright, as the shell would report it at the slice's surface. */
export function poseAt(tile: TilePoint, { facing, vx = 0, vy = 0 }: PoseOptions): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      x: tile.tx * 1000 + 500,
      y: tile.ty * 1000 + 500,
      vx,
      vy,
      upx: 0,
      upy: 1024,
      facing,
      driving: false,
      thrusting: false,
      drilling: false,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
      drive: NO_DRIVE,
    },
  }
}

/**
 * A track at level `level`, sent as its step (#180: `debug.setUpgrade` takes the step): a major, or
 * drill power's purchase count, which is its step (#552).
 */
export const setUpgrade = (upgradeId: UpgradeId, level: number): CommandIntent => ({
  type: 'debug.setUpgrade',
  payload: { upgradeId, level: stepOfLevel(upgradeId, level) },
})

export const setHull = (hull: string): CommandIntent => ({
  type: 'debug.setHull',
  payload: { hull },
})

export const spawnEnemy = (kind: string, tier: number, dx: number, dy = 0): CommandIntent =>
  spawnEnemyCommand(kind, tier, { dx, dy })

export const freezeEnemies = freezeEnemiesCommand

/** A command a spec sends at an absolute tick, kept so a replay can send it again. */
export interface TimedCommand {
  tick: number
  intent: CommandIntent
}

/**
 * The corridor set-up as commands: bore it, then stand the vehicle in its middle with the planet 1
 * on-curve hull (`hullMax "125.44"`, #25 acceptance 2) and the fight drill.
 */
export function corridorCommands(facing: Facing = FACING.right): TimedCommand[] {
  const commands: TimedCommand[] = [
    { tick: 0, intent: setUpgrade('drill_power', BORE_DRILL_LEVEL) },
  ]
  let tick = 1
  for (let dx = -CORRIDOR_HALF_LENGTH; dx <= CORRIDOR_HALF_LENGTH; dx++) {
    const tile = { tx: CORRIDOR_MIDDLE.tx + dx, ty: CORRIDOR_ROW }
    commands.push({ tick, intent: poseAt(tile, { facing: FACING.right }) })
    commands.push({ tick: tick + BORE_TICKS, intent: drill(tile, BORE_TICKS) })
    tick += BORE_TICKS + 1
  }
  return [
    ...commands,
    { tick, intent: setUpgrade('drill_power', FIGHT_DRILL_LEVEL) },
    { tick, intent: setUpgrade('hull', 2) },
    { tick, intent: setHull('125.44') },
    { tick, intent: poseAt(CORRIDOR_MIDDLE, { facing }) },
  ]
}

/** Sends the corridor set-up; returns the tick the fight can start at. */
export function prepareCorridor(session: ScriptedSession, facing: Facing = FACING.right): number {
  const commands = corridorCommands(facing)
  for (const { tick, intent } of commands) session.submit(tick, intent)
  return commands[commands.length - 1].tick
}

/** Clear of every spawn point by more than the 24-tile activation reach plus a 10-tile margin. */
const QUIET_RADIUS_TILES = 34

/** The first tile one row under the surface, right of the pad, with no spawn point near it. */
export function quietTileUnderSurface(params: PlanetParams): TilePoint {
  for (let tx = 10; tx < params.radiusTiles; tx++) {
    const tile = { tx, ty: surfaceRowOfColumn(tx, params.radiusTiles) - 1 }
    const x = tile.tx * 1000 + 500
    const y = tile.ty * 1000 + 500
    if (spawnPointsWithin(params, x, y, QUIET_RADIUS_TILES).length === 0) return tile
  }
  throw new Error('no quiet tile under the surface')
}

export const setPlanet = (planetIndex: number): CommandIntent => ({
  type: 'debug.setPlanet',
  payload: { planetIndex },
})
