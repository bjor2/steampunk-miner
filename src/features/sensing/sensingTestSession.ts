/**
 * Spec plumbing for the sensing lane, on the loaded slices: a planet-1 session owning every
 * shipped sensing item with chosen ones slotted, a pocket carved underground with the miner at
 * rest in it, and slot presses, set up through `debug.*` commands like a start scenario. Only
 * specs use it.
 */
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { replayRun, type ReplayResult } from '../../systems/replay/replayRun'
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

/** One command of a recorded run, at its tick. */
export type TimedIntent = readonly [number, CommandIntent]

/** Every node through `planetIndex` researched, as the debug "jump to depth" grants it. */
export function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } } as CommandIntent
}

/** `slots` filled, every shipped sensing item owned, and the miner on the surface: from tick 0. */
export function ownedLoadoutIntents(slots: Readonly<Record<string, string>>): TimedIntent[] {
  const owned = SHIPPED_SENSING_ITEMS.map((item) => item.itemId)
  return [
    [0, setVehicleLoadoutCommand(slots, owned)],
    [1, poseAbove(GROUND, FACING.right)],
  ]
}

/** `standInPocket` as commands of a recorded run. */
export function pocketIntents(tick: number, tile: TilePoint, facing: Facing): TimedIntent[] {
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  const { payload } = poseAbove(GROUND, facing)
  return [
    [tick, carveCircleCommand({ ...centre, radius: POCKET_RADIUS_MM, amount: SOLID_DENSITY })],
    [tick, { type: 'reportPose', payload: { ...payload, ...centre, vx: 0, vy: 0 } }],
  ]
}

/** The run's commands as `applyCommand` receives them, from `p1`, numbered in order. */
export function commandsOf(intents: readonly TimedIntent[]): AuthorityCommand[] {
  return intents.map(
    ([tick, intent], index) =>
      ({ playerId: 'p1', tick, seq: index + 1, ...intent }) as AuthorityCommand,
  )
}

/** The run jumped to each command, then in render frames of 30 and of 144 a second. */
export function replayedAtEveryRate(
  commands: readonly AuthorityCommand[],
  endTick: number,
): ReplayResult[] {
  return [undefined, 30, 144].map((framesPerSecond) =>
    replayRun(WORLD_SEED, commands, { endTick, framesPerSecond }),
  )
}
