/**
 * Places the combat specs fight in (#25), on the scripted planet 1 of `scriptedSession.ts`: a short
 * corridor bored one row under the surface at x = 14..26, in band 1 where no enemy spawns and with
 * no spawn point within 34 tiles, so the only enemies in a fight are the ones a spec spawns.
 * The vehicle stands in the corridor's middle; enemies come along it.
 */
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import { drill, type ScriptedSession } from '../scriptedSession'

export const CORRIDOR_ROW = 297
export const CORRIDOR_MIDDLE: TilePoint = { tx: 20, ty: CORRIDOR_ROW }
const CORRIDOR_HALF_LENGTH = 6
/** Band 1 ground breaks in the drill's minimum 24 ticks a tile (#6). */
const BORE_TICKS = 30

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
    },
  }
}

export const setUpgrade = (upgradeId: string, level: number): CommandIntent => ({
  type: 'debug.setUpgrade',
  payload: { upgradeId, level },
})

export const setHull = (hull: string): CommandIntent => ({
  type: 'debug.setHull',
  payload: { hull },
})

export const spawnEnemy = (kind: string, tier: number, dx: number, dy = 0): CommandIntent => ({
  type: 'debug.spawnEnemy',
  payload: { kind, tier, dx, dy },
})

export const freezeEnemies = (frozen: boolean): CommandIntent => ({
  type: 'debug.freezeEnemies',
  payload: { frozen },
})

/**
 * Bores the corridor, then stands the vehicle in its middle with the planet 1 on-curve hull
 * (`hullMax "125.44"`, #25 acceptance 2) and drill power. Returns the tick the fight can start at.
 */
export function prepareCorridor(session: ScriptedSession, facing: Facing = FACING.right): number {
  session.submit(0, setUpgrade('drill_power', 60))
  let tick = 1
  for (let dx = -CORRIDOR_HALF_LENGTH; dx <= CORRIDOR_HALF_LENGTH; dx++) {
    const tile = { tx: CORRIDOR_MIDDLE.tx + dx, ty: CORRIDOR_ROW }
    session.submit(tick, poseAt(tile, { facing: FACING.right }))
    session.submit(tick + BORE_TICKS, drill(tile, BORE_TICKS))
    tick += BORE_TICKS + 1
  }
  session.submit(tick, setUpgrade('drill_power', 13))
  session.submit(tick, setUpgrade('hull', 2))
  session.submit(tick, setHull('125.44'))
  session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing }))
  return tick
}
