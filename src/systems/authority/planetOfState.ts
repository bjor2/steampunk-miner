/**
 * The planet the authority's session is on, as generator params (decision #4). The state holds
 * the planet index and the world seed (a scenario's `worldSeed`); the params are a pure function
 * of the two, so they are derived here, never stored. A session whose planet cannot be generated
 * (index 0, a seed outside uint32) has no world: vehicle commands are refused there.
 */
import { dockSiteOf, type DockSite } from '../world/dockSite'
import { rejectionOf, type Rejection } from './commandRule'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'

export interface SessionPlanet {
  index: number
  /** The world seed every planet's seed derives from (#4). */
  seed: number
}

const TWO_TO_32 = 0x100000000

let lastParams: PlanetParams | null = null

export function planetParamsOf(planet: SessionPlanet): PlanetParams | null {
  if (!isGeneratablePlanet(planet)) return null
  if (lastParams?.worldSeed !== planet.seed || lastParams.planetIndex !== planet.index) {
    lastParams = planetParamsFor(planet.seed, planet.index)
  }
  return lastParams
}

export function dockSiteOfPlanet(planet: SessionPlanet): DockSite | null {
  const params = planetParamsOf(planet)
  return params === null ? null : dockSiteOf(params)
}

function isGeneratablePlanet(planet: SessionPlanet): boolean {
  const isUint32Seed = Number.isInteger(planet.seed) && planet.seed >= 0 && planet.seed < TWO_TO_32
  return isUint32Seed && Number.isSafeInteger(planet.index) && planet.index >= 1
}

/** Vehicle commands need a world to act in. */
export function noPlanetRejection(planet: SessionPlanet): Rejection | null {
  if (planetParamsOf(planet) !== null) return null
  return rejectionOf('no_planet', `planet ${planet.index} has no generated world`)
}
