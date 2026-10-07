/**
 * The order a live blast clears its tiles in (Technical Director, #154 "expanding front", K6 #189):
 * every tile whose centre lies within the radius of the charge tile's centre, nearest first, ties
 * in row order (bottom row first, then left to right), so slice k of a blast is a pure function of
 * the blast and k. The tile count is this in-radius count, not pi r^2: 1,793 tiles at R24, which
 * `BLAST_TILES_PER_TICK` = 64 tiles a tick clear in 29 ticks.
 */
import { BLAST_TILES_PER_TICK } from '../../../constants/terrainBudget'
import { MM_PER_METRE } from '../../../constants/physics'

/** A tile of the front: its offset from the charge tile and its squared distance in tiles. */
export interface FrontTile {
  dx: number
  dy: number
  distanceSq: number
}

/** Fronts are pure in the radius, so each is built once. */
const frontsByRadius = new Map<number, readonly FrontTile[]>()

export function blastFrontOf(radiusMm: number): readonly FrontTile[] {
  const known = frontsByRadius.get(radiusMm)
  if (known !== undefined) return known
  const front = sortNearestFirst(tilesWithin(radiusMm))
  frontsByRadius.set(radiusMm, front)
  return front
}

export function inRadiusCount(radiusMm: number): number {
  return blastFrontOf(radiusMm).length
}

/** Ticks a blast of this radius takes to clear in solid rock. */
export function ticksToClear(radiusMm: number): number {
  return Math.ceil(inRadiusCount(radiusMm) / BLAST_TILES_PER_TICK)
}

/** A front tile's distance from the charge tile's centre, floored to whole millimetres. */
export function frontRadiusMm(distanceSq: number): number {
  return Math.floor(Math.sqrt(distanceSq * MM_PER_METRE * MM_PER_METRE))
}

function tilesWithin(radiusMm: number): FrontTile[] {
  const reach = Math.floor(radiusMm / MM_PER_METRE)
  const limitSq = radiusMm * radiusMm
  const tiles: FrontTile[] = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const distanceSq = dx * dx + dy * dy
      if (distanceSq * MM_PER_METRE * MM_PER_METRE <= limitSq) tiles.push({ dx, dy, distanceSq })
    }
  }
  return tiles
}

/** Array sort is stable, so equal distances keep the row order they were built in. */
function sortNearestFirst(tiles: FrontTile[]): FrontTile[] {
  return tiles.sort((a, b) => a.distanceSq - b.distanceSq)
}
