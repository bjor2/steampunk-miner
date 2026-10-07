/**
 * Spec plumbing for the terrain lane, on the loaded slices: a planet-1 session with terrain tools
 * slotted, the miner standing at rest in a small pocket carved underground, and reads of the ore
 * around a tile, set up through `debug.*` commands like a start scenario. Only specs use it.
 */
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  continueScriptedSession,
  GROUND,
  PARAMS,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { FACING, type Facing } from '../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../systems/world/planetParams'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, materialCellAt } from '../../systems/world/worldState'
import { intentToUseSlot, type PowerUpSlot } from '../power-up-core'

export const MM = 1000

/** The pocket the miner stands in: its own tile and a sliver of each neighbour. */
const STANDING_POCKET_MM = 900

export const press = (slot: PowerUpSlot = 'powerup.1') => intentToUseSlot(slot)

export const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

/** The tile `depth` tiles below the surface tile of column `tx`. */
export function buriedTile(depth: number, tx: number = GROUND.tx): TilePoint {
  return { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) - depth }
}

/** A planet-1 session on `planetSeed` at tick 1, `slots` filled for each player (owning each). */
export function sessionWith(
  slots: Readonly<Record<string, string>>,
  playerIds: readonly string[] = ['p1'],
  planetSeed: number = WORLD_SEED,
): ScriptedSession {
  const session = continueScriptedSession(
    createAuthorityState({ planetIndex: 1, planetSeed, playerIds }),
  )
  for (const playerId of playerIds) {
    session.submit(0, setVehicleLoadoutCommand(slots), playerId)
    session.submit(1, poseAbove(GROUND, FACING.right), playerId)
  }
  return session
}

/** Carves a pocket round `tile` and reports the miner at rest at its centre, facing `facing`. */
export function standAt(
  session: ScriptedSession,
  tick: number,
  tile: TilePoint,
  facing: Facing,
  playerId = 'p1',
): void {
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  session.submit(
    tick,
    carveCircleCommand({ ...centre, radius: STANDING_POCKET_MM, amount: SOLID_DENSITY }),
    playerId,
  )
  const { payload } = poseAbove(GROUND, facing)
  session.submit(tick, { type: 'reportPose', payload: { ...payload, ...centre } }, playerId)
}

/** The ore tiles whose centre lies within `radius` tiles of `centre`, with their material. */
export function oreAround(state: AuthorityState, centre: TilePoint, radius: number) {
  const ore: { tile: TilePoint; cell: number }[] = []
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const tile = { tx: centre.tx + dx, ty: centre.ty + dy }
      if (dx * dx + dy * dy > radius * radius) continue
      const cell = cellAt(state.world, paramsOf(state), tile)
      if (kindOfCell(cell) === CELL_KIND.ore) ore.push({ tile, cell })
    }
  }
  return ore
}

/** Every material cell in a square round `centre`, as one comparable list. */
export function materialsAround(state: AuthorityState, centre: TilePoint, reach: number) {
  const cells: number[] = []
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      cells.push(
        materialCellAt(state.world, paramsOf(state), { tx: centre.tx + dx, ty: centre.ty + dy }),
      )
    }
  }
  return cells
}

/** The params of the planet the session stands on. */
export function paramsOf(state: AuthorityState): PlanetParams {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the session is between planets')
  return params
}
