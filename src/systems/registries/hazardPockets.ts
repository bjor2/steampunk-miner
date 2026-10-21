/**
 * Where a planet's hazard pockets lie (ticket 652, spec #647; the design rows of ticket 651). The
 * `ores` slice owns the planet registry row that names a planet's hazard, its depth window as
 * fractions of the radius and its pocket lattice, so it provides the read; the kernel asks here.
 *
 * A pocket is a read of the planet and the cell, never a repaint, as the magnetic class's
 * electrified cells are (`magneticGround.ts`): the generated cells stay byte-identical, and every
 * player of a session gets the same pockets in any chunk order. Only a planet entered under ore
 * rules 8 (`isHazardPocketPlanet`) is asked, so a planet a save holds under rules 7 or earlier, and
 * planet 1, meet none. With no provider no planet has a pocket.
 */
import { isHazardPocketPlanet, type PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { defineOneProviderRegistry, entriesOf } from './seal'

/** The hazard kind id of the pocket `cell` at `tile` lies in, or null for none. */
export type HazardPocketTest = (tile: TilePoint, cell: number) => string | null

export interface HazardPocketsProvider {
  id: string
  /**
   * The planet's pocket read, with its window and seed worked out once; null for a planet whose
   * row holds no hazard.
   */
  pocketTestOf(params: PlanetParams): HazardPocketTest | null
}

export const HAZARD_POCKETS_REGISTRY =
  defineOneProviderRegistry<HazardPocketsProvider>('hazardPockets')

/** The planet's pocket read; null under ore rules 7 or earlier, on planet 1, or with no provider. */
export function hazardPocketTestOf(params: PlanetParams): HazardPocketTest | null {
  const [provider] = entriesOf(HAZARD_POCKETS_REGISTRY)
  if (provider === undefined || !isHazardPocketPlanet(params)) return null
  return provider.pocketTestOf(params)
}

/** The hazard kind of the pocket `cell` at `tile` lies in; null for none. */
export function hazardPocketKindAt(
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): string | null {
  return hazardPocketTestOf(params)?.(tile, cell) ?? null
}
