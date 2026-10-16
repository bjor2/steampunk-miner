/**
 * The planet the authority's session is on, as generator params (decision #4). The state holds
 * the planet index and the world seed (a scenario's `worldSeed`); the params are a pure function
 * of the two, so they are derived here, never stored. A session whose planet cannot be generated
 * (index 0, a seed outside uint32) has no world: vehicle commands are refused there.
 *
 * A planet entered from this build carries the ore rules it was entered under (TD ruling on ticket
 * 445); one a save holds without them stays on the legacy rows until the player travels on.
 */
import { dockSiteOf, type DockSite } from '../world/dockSite'
import { rejectionOf, type Rejection } from './commandRule'
import {
  isKnownOreRulesVersion,
  oreRulesVersionOnEntry,
  planetParamsFor,
  type PlanetParams,
} from '../world/planetParams'

export interface SessionPlanet {
  index: number
  /** The world seed every planet's seed derives from (#4). */
  seed: number
  /** The ore rules the planet was entered under; the key is absent on the legacy rows. */
  oreRulesVersion?: number
}

/** A planet as this build enters it: stamped with its ore rules from their first planet. */
export function enteredPlanetOf(index: number, seed: number): SessionPlanet {
  return withOreRulesVersion({ index, seed }, oreRulesVersionOnEntry(index))
}

/** The planet with the stamp under its key, or no key at all when there is none. */
export function withOreRulesVersion(
  planet: Pick<SessionPlanet, 'index' | 'seed'>,
  oreRulesVersion: number | undefined,
): SessionPlanet {
  const { index, seed } = planet
  return oreRulesVersion === undefined ? { index, seed } : { index, seed, oreRulesVersion }
}

const TWO_TO_32 = 0x100000000

let lastParams: PlanetParams | null = null

export function planetParamsOf(planet: SessionPlanet): PlanetParams | null {
  if (!isGeneratablePlanet(planet)) return null
  if (lastParams === null || !isPlanetOfParams(planet, lastParams)) {
    lastParams = planetParamsFor(planet.seed, planet.index, planet.oreRulesVersion)
  }
  return lastParams
}

/** The one-slot cache's key: a legacy and a stamped planet of one seed and index differ. */
function isPlanetOfParams(planet: SessionPlanet, params: PlanetParams): boolean {
  const isSamePlace = params.worldSeed === planet.seed && params.planetIndex === planet.index
  return isSamePlace && params.oreRulesVersion === planet.oreRulesVersion
}

export function dockSiteOfPlanet(planet: SessionPlanet): DockSite | null {
  const params = planetParamsOf(planet)
  return params === null ? null : dockSiteOf(params)
}

function isGeneratablePlanet(planet: SessionPlanet): boolean {
  const isUint32Seed = Number.isInteger(planet.seed) && planet.seed >= 0 && planet.seed < TWO_TO_32
  const isIndex = Number.isSafeInteger(planet.index) && planet.index >= 1
  return isUint32Seed && isIndex && isKnownOreRulesVersion(planet.oreRulesVersion)
}

/** Vehicle commands need a world to act in. */
export function noPlanetRejection(planet: SessionPlanet): Rejection | null {
  if (planetParamsOf(planet) !== null) return null
  return rejectionOf('no_planet', `planet ${planet.index} has no generated world`)
}
