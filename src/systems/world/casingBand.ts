/**
 * The band whose casing grade a tile needs (decision #41 Systems & Economy, #43 Rule): its own
 * band, or inside the core the core's band (6, #6), which needs `casingGradeCoreMin`. The HUD's
 * grade telegraph and the collapse weak test read the same rule.
 */
import { ECONOMY } from '../economy/economy'
import { bandOfTile, isCoreTile } from './planetGeometry'
import type { PlanetParams } from './planetParams'

export function casingBandOfTile(params: PlanetParams, tx: number, ty: number): number {
  return isCoreTile(params, tx, ty) ? ECONOMY.ore.coreTierBand : bandOfTile(params, tx, ty)
}
