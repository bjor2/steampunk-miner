/**
 * The planet 8 lava pocket the lava specs touch and flood (#113): the first band-3 pocket floor of
 * the scripted seed, a hole carved under it, and pose reports beside it. Only specs use it.
 */
import { FACING } from '../../vehicle/vehiclePose'
import { isLavaAt } from '../../world/lavaFlow'
import { bandOfTile } from '../../world/planetGeometry'
import { planetParamsFor } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import type { CommandIntent } from '../authorityCommand'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'

/** The first heat planet (#113 Fire act). */
export const HEAT_PLANET = 8

export const HEAT_PARAMS = planetParamsFor(WORLD_SEED, HEAT_PLANET)

/** A band-3 lava cell above plain ground: the floor of a pocket. */
function pocketFloor(): TilePoint {
  for (let ty = 300; ty > 100; ty--) {
    for (let tx = -40; tx <= 40; tx++) {
      const isFloor =
        bandOfTile(HEAT_PARAMS, tx, ty) === 3 &&
        isLavaAt(EMPTY_WORLD, HEAT_PARAMS, { tx, ty }) &&
        kindOfCell(cellAt(EMPTY_WORLD, HEAT_PARAMS, { tx, ty: ty - 1 })) === CELL_KIND.ground &&
        kindOfCell(cellAt(EMPTY_WORLD, HEAT_PARAMS, { tx, ty: ty - 3 })) === CELL_KIND.ground
      if (isFloor) return { tx, ty }
    }
  }
  throw new Error('no lava pocket floor found')
}

export const FLOOR = pocketFloor()
export const BELOW_FLOOR = { tx: FLOOR.tx, ty: FLOOR.ty - 1 }
export const HOLE = { x: FLOOR.tx * 1000 + 500, y: BELOW_FLOOR.ty * 1000 + 500 }
/** Clear of the hole, far enough down that lava reaching the hole never touches it. */
export const AWAY = { x: HOLE.x, y: HOLE.y - 30000 }
/** The vehicle stands against the pocket's floor from below, its body 0.5 m under the lava. */
export const AGAINST_LAVA = { x: HOLE.x, y: FLOOR.ty * 1000 - 500 }

/** Player `p1` on the heat planet with its enemies frozen, so only lava acts. */
export function onHeatPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: HEAT_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  return session
}

/** An upright pose report facing up at `at`, drilling for `drillTicks` when above 0. */
export function reportAt(at: { x: number; y: number }, drillTicks = 0): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: FACING.up,
      driving: false,
      thrusting: false,
      drilling: drillTicks > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks,
    },
  }
}

export const carveHole: CommandIntent = {
  type: 'debug.carveCircle',
  payload: { x: HOLE.x, y: HOLE.y, radius: 950, amount: 255 },
}
