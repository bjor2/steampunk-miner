/**
 * What the hazard barometer warns of (#162 Sensing row, the lookahead from #162 4.4): the cells
 * ahead of the drill, from the nose tile out to its lookahead along the facing, that hold a lava
 * pocket or sit in a collapse block whose lining is weak (decision #43). Vacuum and fluid pockets
 * join when a planet has them. Reveal only (Vertical Scaler on #157): it never stops the drill.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  facingVectorOf,
  tileOfMillimetres,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import { blockContaining } from '../../../systems/world/collapseBlock'
import { weaknessOfBlock } from '../../../systems/world/collapseWeakness'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { isLavaCell } from '../../../systems/world/worldCell'
import { cellAt, type WorldState } from '../../../systems/world/worldState'

export type BarometerHazard = 'lava' | 'collapse'

export interface BarometerWarning {
  tile: TilePoint
  /** 1 for the nose tile, then one more each cell further along the facing. */
  cellsAhead: number
  hazard: BarometerHazard
}

interface Ground {
  world: WorldState
  params: PlanetParams
}

const HALF_TILE_MM = MM_PER_METRE / 2

/** Every warned cell ahead of the drill, nearest first; empty with no pose or no world. */
export function barometerWarningsOf(
  state: AuthorityState,
  playerId: string,
  lookaheadCells: number,
): BarometerWarning[] {
  const pose = state.players[playerId].vehicle.pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return []
  const ground = { world: state.world, params }
  return tilesAheadOf(pose, lookaheadCells).flatMap((tile, at) => warningAt(ground, tile, at + 1))
}

/** The tiles one, two, ... `cells` tile lengths from the centre along the drill's facing. */
function tilesAheadOf(pose: VehiclePose, cells: number): TilePoint[] {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return Array.from({ length: cells }, (_, at) =>
    tileOfMillimetres(
      pose.x + Math.floor((facing.x * MM_PER_METRE * (at + 1)) / UP_VECTOR_SCALE),
      pose.y + Math.floor((facing.y * MM_PER_METRE * (at + 1)) / UP_VECTOR_SCALE),
    ),
  )
}

function warningAt(ground: Ground, tile: TilePoint, cellsAhead: number): BarometerWarning[] {
  const hazard = hazardAt(ground, tile)
  return hazard === null ? [] : [{ tile, cellsAhead, hazard }]
}

/** Lava first: a pocket burns whatever the lining does. */
function hazardAt(ground: Ground, tile: TilePoint): BarometerHazard | null {
  if (isLavaCell(cellAt(ground.world, ground.params, tile))) return 'lava'
  return isInWeakBlock(ground, tile) ? 'collapse' : null
}

function isInWeakBlock(ground: Ground, tile: TilePoint): boolean {
  const centre = {
    xMm: tile.tx * MM_PER_METRE + HALF_TILE_MM,
    yMm: tile.ty * MM_PER_METRE + HALF_TILE_MM,
  }
  return weaknessOfBlock(ground.world, ground.params, blockContaining(centre)) !== null
}
