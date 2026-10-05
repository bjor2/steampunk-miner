/**
 * The band whose casing grade a tile needs (decision #41 Systems & Economy, #43 Rule): its own
 * band, or inside the core the core's band (6, #6), which needs `casingGradeCoreMin`. The HUD's
 * grade telegraph and the collapse weak test read the same rule.
 *
 * A first-placed lining is priced by the band of the wall it lines (#76, #85: rock-side lining
 * touches the wall, not the bore's axis). A ring that straddles a band boundary pays the deeper
 * band, the one whose grade the whole ring must hold against collapse.
 */
import { ECONOMY } from '../economy/economy'
import { tileOfSample } from './groundEditSession'
import { bandOfTile, isCoreTile } from './planetGeometry'
import type { PlanetParams } from './planetParams'
import type { WeightedSample } from './stampShape'

export function casingBandOfTile(params: PlanetParams, tx: number, ty: number): number {
  return isCoreTile(params, tx, ty) ? ECONOMY.ore.coreTierBand : bandOfTile(params, tx, ty)
}

/** The deepest casing band among newly lined wall samples; at least one sample is expected. */
export function casingBandOfWall(params: PlanetParams, wall: readonly WeightedSample[]): number {
  return wall
    .map((sample) => tileOfSample(sample))
    .reduce((deepest, tile) => Math.max(deepest, casingBandOfTile(params, tile.tx, tile.ty)), 0)
}
