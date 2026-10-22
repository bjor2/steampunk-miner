/**
 * The depth and core dial of the gauge cluster (spec #678, ticket 716, Systems' line): the needle
 * is the rig's depth in metres over the planet's radius R(p), which the planet's params hold from
 * the #707 planet-row registry (`radiusTilesUnder`). Its marks are that planet's own data, never
 * placed by hand: the head of each band on the dock column, where the HUD's band readout turns
 * (`bandOfTile` on column 0, #6 section 2), and the core's top tile (`coreDepthOf`). One tile is
 * one metre (#7). Pure and integer, like the band rule it reads.
 */
import { coreDepthOf } from '../world/openedDepth'
import type { PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'

export type DepthMarkKind = 'band' | 'core'

/** A mark on the dial: the depth in metres where it sits. */
export interface DepthMark {
  kind: DepthMarkKind
  depthTiles: number
}

/** What the dial needs of a planet: its radius and its marks, shallowest first. */
export interface DepthScale {
  radiusTiles: number
  marks: readonly DepthMark[]
}

/** A mark on the dial's face, 0 at the surface and 1000 at R(p). */
export interface DepthMarker {
  kind: DepthMarkKind
  permille: number
}

export interface DepthDial {
  /** Depth over R(p), 0..1000. */
  needlePermille: number
  markers: readonly DepthMarker[]
}

const PERMILLE = 1000
/** The column the dock stands on, where the HUD reads the band (`bandAtDepth`). */
const DOCK_COLUMN = 0
/** `halfTileDistanceSq` of the dock column's tiles adds the column's own (2·0+1)². */
const DOCK_COLUMN_HALF_TILE_SQ = 1

export function depthScaleOf(params: PlanetParams): DepthScale {
  const surfaceRow = surfaceRowOfColumn(DOCK_COLUMN, params.radiusTiles)
  const bands = params.bandStartsHalfTileSq.map((startSq) => ({
    kind: 'band' as const,
    depthTiles: bandHeadDepthOf(startSq, surfaceRow),
  }))
  return {
    radiusTiles: params.radiusTiles,
    marks: [...bands, { kind: 'core', depthTiles: coreDepthOf(params) }],
  }
}

/** The needle and markers of a rig `depthTiles` down; a dial at rest with no planet. */
export function depthDialOf(depthTiles: number, scale: DepthScale | null): DepthDial {
  if (scale === null) return { needlePermille: 0, markers: [] }
  return {
    needlePermille: depthPermilleOf(depthTiles, scale.radiusTiles),
    markers: scale.marks.map((mark) => ({
      kind: mark.kind,
      permille: depthPermilleOf(mark.depthTiles, scale.radiusTiles),
    })),
  }
}

/** Depth over the radius, cut toward zero and held to the dial. */
export function depthPermilleOf(depthTiles: number, radiusTiles: number): number {
  if (radiusTiles <= 0 || depthTiles <= 0) return 0
  return Math.min(PERMILLE, Math.floor((depthTiles * PERMILLE) / radiusTiles))
}

/**
 * The shallowest depth on the dock column whose tile lies inside a band's inner edge: the highest
 * row `y` with `1 + (2y+1)² <= startSq`, counted down from the surface row.
 */
function bandHeadDepthOf(startSq: number, surfaceRow: number): number {
  const highestOddWidth = integerSqrtOf(startSq - DOCK_COLUMN_HALF_TILE_SQ)
  const highestRow = Math.floor((highestOddWidth - 1) / 2)
  return Math.max(0, surfaceRow - highestRow)
}

/** The largest whole number whose square is at most `square`, exact past float rounding. */
function integerSqrtOf(square: number): number {
  if (square <= 0) return 0
  let root = Math.floor(Math.sqrt(square))
  while (root * root > square) root -= 1
  while ((root + 1) * (root + 1) <= square) root += 1
  return root
}
