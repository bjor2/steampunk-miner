/**
 * Spec plumbing for the sensing lane, on the loaded slices: a planet-1 session owning every
 * shipped sensing item with chosen ones slotted, a pocket carved underground with the miner at
 * rest in it, and slot presses, set up through `debug.*` commands like a start scenario. Only
 * specs use it.
 */
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING, type Facing } from '../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../systems/world/tileGrid'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { intentToUseSlot, type PowerUpSlot } from '../power-up-core'
import { SHIPPED_SENSING_ITEMS } from './systems/sensingContent'

export const MM = 1000

/** Planet 1 opens two power-up slots (#162 2.2). */
export const ECHO_AND_BUOY = {
  'powerup.1': 'power.echo_sounder',
  'powerup.2': 'consumable.signal_buoy',
} as const

/** The pocket's radius: open ground round the hull, and the cell two tiles up still stands. */
const POCKET_RADIUS_MM = 1600

export const press = (slot: PowerUpSlot) => intentToUseSlot(slot)

/** A session at tick 1 for `playerIds`, each owning every shipped item, on the surface. */
export function sensingSession(
  slots: Readonly<Record<string, string>> = ECHO_AND_BUOY,
  playerIds: readonly string[] = ['p1'],
): ScriptedSession {
  const session = createScriptedSession(playerIds)
  const owned = SHIPPED_SENSING_ITEMS.map((item) => item.itemId)
  playerIds.forEach((playerId) => {
    session.submit(0, setVehicleLoadoutCommand(slots, owned), playerId)
    session.submit(1, poseAbove(GROUND, FACING.right), playerId)
  })
  return session
}

/** Carves a pocket round `tile` and reports `playerId` at rest at its centre, facing `facing`. */
export function standInPocket(
  session: ScriptedSession,
  tick: number,
  tile: TilePoint,
  facing: Facing = FACING.right,
  playerId = 'p1',
): void {
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  session.submit(
    tick,
    carveCircleCommand({ ...centre, radius: POCKET_RADIUS_MM, amount: SOLID_DENSITY }),
  )
  const { payload } = poseAbove(GROUND, facing)
  session.submit(
    tick,
    { type: 'reportPose', payload: { ...payload, ...centre, vx: 0, vy: 0 } },
    playerId,
  )
}
