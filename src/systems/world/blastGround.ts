/**
 * A charge's blast on the ground (spec #109 "Verb" and "Limits"): every sample of each blast tile
 * the caller says may break drops to air at once, whatever the drill would need, and a lined
 * sample keeps its density and its casing, so lined rings hold as usual. A tile the caller refuses
 * (core, too hard, the dock pad) keeps every sample. Cells that fall to their yield are reported
 * as the drill's are (#36), so the caller credits their ore.
 */
import { cellSamplesOf } from './stampShape'
import {
  casingGradeOf,
  closeSession,
  densityOf,
  editSample,
  isCarvable,
  materialOfSample,
  openSession,
  type EditSession,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import type { TilePoint } from './tileGrid'
import type { WorldState } from './worldState'

/** Whether a blast breaks this tile of this material. */
export type IsBlastBreakable = (tile: TilePoint, material: number) => boolean

export interface GroundBlast extends GroundEdit {
  /** Tiles the blast took any ground from. */
  tilesCleared: number
}

export function blastGround(
  world: WorldState,
  params: PlanetParams,
  tiles: readonly TilePoint[],
  isBreakable: IsBlastBreakable,
): GroundBlast {
  const session = openSession(world, params)
  const tilesCleared = tiles.filter((tile) => blastTile(session, tile, isBreakable)).length
  return { ...closeSession(session), tilesCleared }
}

/** Clears the tile's unlined samples; true when it took any ground. */
function blastTile(session: EditSession, tile: TilePoint, isBreakable: IsBlastBreakable): boolean {
  const samples = cellSamplesOf(tile).filter((sample) => isCarvable(session, sample))
  if (samples.length === 0 || !isBreakable(tile, materialOfSample(session, samples[0]))) {
    return false
  }
  const unlined = samples.filter((sample) => casingGradeOf(session, sample) === 0)
  const isCleared = unlined.some((sample) => densityOf(session, sample) > 0)
  for (const sample of unlined) editSample(session, sample, () => 0)
  return isCleared
}
