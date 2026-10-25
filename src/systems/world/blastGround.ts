/**
 * A charge's blast on the ground (spec #109 "Verb" and "Limits"): every sample of each blast tile
 * the caller says may break drops to air at once, whatever the drill would need, and a lined
 * sample keeps its density and its casing, so lined rings hold as usual. A tile the caller refuses
 * (core, too hard, the dock pad) keeps every sample. Cells that fall to their yield are reported
 * as the drill's are (#36), so the caller credits their ore.
 *
 * A live blast breaks its tiles a slice at a time (K6 #189): the tiles in front order, stopping
 * once `maxCleared` of them gave ground. A tile that gives none (air, a refused cell, lining) is
 * passed over without counting, so anchors never slow the front, up to `maxVisited` tiles a slice
 * (D1 #860), so a widened disc reaching far past the planet never walks its space in one tick.
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

/** A slice's stops: the tiles it may clear, and the tiles it may look at. */
export interface BlastSliceLimits {
  maxCleared: number
  maxVisited: number
}

export interface GroundBlast extends GroundEdit {
  /** Tiles the blast took any ground from. */
  tilesCleared: number
  /** Tiles looked at, from the first: a later slice starts after them. */
  tilesVisited: number
}

export function blastGround(
  world: WorldState,
  params: PlanetParams,
  tiles: Iterable<TilePoint>,
  isBreakable: IsBlastBreakable,
  limits: BlastSliceLimits,
): GroundBlast {
  const session = openSession(world, params)
  const counts = blastTilesUpTo(session, tiles, isBreakable, limits)
  return { ...closeSession(session), ...counts }
}

/**
 * Stops at the slice's cleared tiles, before taking a tile it would not look at, so the walk
 * feeding it stands exactly past the last tile visited (D1 #860), or at its visits.
 */
function blastTilesUpTo(
  session: EditSession,
  tiles: Iterable<TilePoint>,
  isBreakable: IsBlastBreakable,
  { maxCleared, maxVisited }: BlastSliceLimits,
): { tilesCleared: number; tilesVisited: number } {
  let tilesCleared = 0
  let tilesVisited = 0
  if (maxCleared === 0 || maxVisited === 0) return { tilesCleared, tilesVisited }
  for (const tile of tiles) {
    if (blastTile(session, tile, isBreakable)) tilesCleared++
    tilesVisited++
    if (tilesCleared === maxCleared || tilesVisited === maxVisited) break
  }
  return { tilesCleared, tilesVisited }
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
