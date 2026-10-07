/**
 * Where a magnetic planet's fields and electrified cells lie (spec #258, ticket 290). The
 * `planet-mix` slice owns the act table that makes a planet magnetic, so it provides both; the
 * kernel's `hazard:magnetic` asks here. Both are pure reads of the planet (and the cell), so every
 * player of a session gets the same answer in any chunk order (#258 Q8). With no provider no
 * planet has a field or an electrified cell, and the hazard never acts.
 */
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface MagneticField {
  /** The ferrous vein's centre, which the field tugs toward. */
  vein: TilePoint
  radiusTiles: number
}

export interface MagneticGroundProvider {
  id: string
  /** The field holding `tile`, the one with the nearest vein when fields overlap; null for none. */
  fieldAt(params: PlanetParams, tile: TilePoint): MagneticField | null
  /** Whether `cell` at `tile` shocks the drill that cuts it. */
  isElectrified(params: PlanetParams, tile: TilePoint, cell: number): boolean
}

export const MAGNETIC_GROUND_REGISTRY =
  defineOneProviderRegistry<MagneticGroundProvider>('magneticGround')

/** The field holding `tile`; null off every field, or with no provider. */
export function magneticFieldHolding(params: PlanetParams, tile: TilePoint): MagneticField | null {
  const [provider] = entriesOf(MAGNETIC_GROUND_REGISTRY)
  return provider === undefined ? null : provider.fieldAt(params, tile)
}

/** Whether `cell` at `tile` is electrified; never with no provider. */
export function isElectrifiedCellAt(params: PlanetParams, tile: TilePoint, cell: number): boolean {
  const [provider] = entriesOf(MAGNETIC_GROUND_REGISTRY)
  return provider !== undefined && provider.isElectrified(params, tile, cell)
}
