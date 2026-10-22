/**
 * A planet's registry row (GD lock on #707, 6326252575): its display name, solar system, species
 * pool, look and frozen radius, resolved for any planet from 1 with no table bound. The kernel
 * builds the generated row first (`Planet {n}`, the solar system from `planets.surfaceLayer`, no
 * pool, the archetype look, #6's ladder radius) and lays the one provider's fields (`ores`) on top,
 * so a field the provider leaves out keeps the generated one. A lookup never fails or wraps.
 *
 * - `look`: the rock tint, horizon and sky band (ticket 653). Null wears the archetype's palette
 *   (#13) and its class band alone (#293). Presentation only: it never reaches `PlanetParams`.
 * - `displayName`: at most `PLANET_NAME_CHARACTERS_MAX` characters (ticket 702). Client-side only:
 *   it never reaches a command, a snapshot, a log line or a digest.
 * - `radius`: the frozen whole-number R(p) = round(300 + 175 ln p) of planets 1 to 10 (tickets 642,
 *   643), an override with its reason, keyed by the first ore rules that size a planet by it. A
 *   planet stamped earlier, or with no override, keeps #6's ladder (`planetParams.ts`), so no save
 *   regenerates and the game never computes `ln` (TD).
 */
import { ECONOMY } from '../economy/economy'
import type { PlanetSkyBandLook } from './planetSkyBand'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface PlanetLook {
  /** Band 1's ground, a display `#rrggbb`; bands 2 to 4 step toward `rockDeep` (#13). */
  rockSurface: string
  /** Band 5's ground, a display `#rrggbb`. */
  rockDeep: string
  /** The sky behind the surface, a display `#rrggbb`; it fades to the underground dark with depth. */
  horizon: string
  /** The band of light along the horizon; a planet class's own band (#293) wins over it. */
  skyBand: PlanetSkyBandLook
}

/** An authored radius over the ladder, frozen from the radius rule. */
export interface FrozenRadius {
  tiles: number
  /** The first ore rules version that sizes the planet by it; earlier stamps keep the ladder. */
  fromOreRules: number
  /** Why the planet is not on the ladder. */
  reason: string
}

export interface PlanetRow {
  planetIndex: number
  displayName: string
  solarSystem: number
  /** The species pool id; null where the planet binds none. */
  poolId: string | null
  /** The planet's own look; null wears its archetype's. */
  look: PlanetLook | null
  /** The frozen radius override; null keeps #6's ladder. */
  radius: FrozenRadius | null
}

/** The fields a provider lays over the generated row; one it leaves out keeps the generated one. */
export type PlanetRowFields = Partial<Pick<PlanetRow, 'displayName' | 'poolId' | 'look' | 'radius'>>

export interface PlanetRowProvider {
  id: string
  /** The planet's own fields, for any planet from 1. */
  rowOf(planetIndex: number): PlanetRowFields
}

export const PLANET_ROW_REGISTRY = defineOneProviderRegistry<PlanetRowProvider>('planetRow')

/** The planet's row: the generated one with the provider's fields on top. */
export function planetRowOf(planetIndex: number): PlanetRow {
  const [provider] = entriesOf(PLANET_ROW_REGISTRY)
  const generated = generatedRowOf(planetIndex)
  return provider === undefined ? generated : withFields(generated, provider.rowOf(planetIndex))
}

/** The planet's display name; `Planet {n}` with no provider. */
export function planetDisplayNameOf(planetIndex: number): string {
  return planetRowOf(planetIndex).displayName
}

/** The planet's own look; null with no provider or where its row holds none. */
export function planetLookOf(planetIndex: number): PlanetLook | null {
  return planetRowOf(planetIndex).look
}

/** The row's frozen radius in tiles under the planet's ore rules; null where the ladder sizes it. */
export function rowRadiusTilesOf(planetIndex: number, oreRulesVersion: number | undefined) {
  const radius = planetRowOf(planetIndex).radius
  const isFrozenUnder = radius !== null && (oreRulesVersion ?? 0) >= radius.fromOreRules
  return isFrozenUnder ? radius.tiles : null
}

/** The solar system a planet sits in: the last `planets.surfaceLayer.systems` row it reached (#306). */
export function solarSystemOf(planetIndex: number): number {
  const reached = ECONOMY.planets.surfaceLayer.systems.filter(
    (row) => row.firstPlanet <= planetIndex,
  )
  return reached.at(-1)?.system ?? 0
}

function generatedRowOf(planetIndex: number): PlanetRow {
  return {
    planetIndex,
    displayName: `Planet ${planetIndex}`,
    solarSystem: solarSystemOf(planetIndex),
    poolId: null,
    look: null,
    radius: null,
  }
}

function withFields(row: PlanetRow, fields: PlanetRowFields): PlanetRow {
  return {
    ...row,
    displayName: fields.displayName ?? row.displayName,
    poolId: fields.poolId ?? row.poolId,
    look: fields.look ?? row.look,
    radius: fields.radius ?? row.radius,
  }
}
