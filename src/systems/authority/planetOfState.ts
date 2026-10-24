/**
 * The planet the authority's session is on, as generator params (decision #4). The state holds
 * the planet index and the world seed (a scenario's `worldSeed`); the params are a pure function
 * of the two, so they are derived here, never stored. A session whose planet cannot be generated
 * (index 0, a seed outside uint32) has no world: vehicle commands are refused there.
 *
 * A planet entered from this build carries the ore rules it was entered under (TD ruling on ticket
 * 445); one a save holds without them stays on the legacy rows until the player travels on.
 *
 * The planet's star-map system (ticket 755) is a canonical index text under `system`, absent in
 * system 1: system 1 is today's planet line, where `index` is the planet's place `p`, so every
 * save from before the star map is in system 1 and digests as before. Past system 1 `index` is the
 * campaign index `g` (#781), and the jump between systems (ticket 759) generates the planet from
 * its address (`starMap/systemPlanetParams.ts`); an index the system does not hold has no world.
 */
import { FIRST_SYSTEM, readIndexText, toIndexText } from '../starMap/planetAddress'
import { isPlanetOfSystem, planetParamsAt } from '../starMap/systemPlanetParams'
import { dockSiteOf, type DockSite } from '../world/dockSite'
import { rejectionOf, type Rejection } from './commandRule'
import {
  isKnownOreRulesVersion,
  oreRulesVersionOnEntry,
  type PlanetParams,
} from '../world/planetParams'

export interface SessionPlanet {
  index: number
  /** The world seed every planet's seed derives from (#4). */
  seed: number
  /** The ore rules the planet was entered under; the key is absent on the legacy rows. */
  oreRulesVersion?: number
  /** The star-map system from 2 as canonical index text (ticket 755); absent in system 1. */
  system?: string
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

/** The planet's star-map system; a planet with no `system` key is in system 1. */
export function systemOfPlanet(planet: SessionPlanet): bigint {
  return planet.system === undefined ? FIRST_SYSTEM : (readIndexText(planet.system) ?? FIRST_SYSTEM)
}

/** The planet with `system` under its key, or no key at all in system 1. */
export function withSystem(planet: SessionPlanet, system: bigint): SessionPlanet {
  const inFirstSystem = withOreRulesVersion(planet, planet.oreRulesVersion)
  return system === FIRST_SYSTEM ? inFirstSystem : { ...inFirstSystem, system: toIndexText(system) }
}

/** Whether a snapshot's `system` field is one a planet may hold: absent, or a system from 2. */
export function isPortableSystem(system: unknown): boolean {
  if (system === undefined) return true
  const index = readIndexText(system)
  return index !== null && index > FIRST_SYSTEM
}

const TWO_TO_32 = 0x100000000

let lastParams: PlanetParams | null = null

export function planetParamsOf(planet: SessionPlanet): PlanetParams | null {
  if (!isGeneratablePlanet(planet)) return null
  if (lastParams === null || !isPlanetOfParams(planet, lastParams)) {
    lastParams = planetParamsAt(
      planet.seed,
      systemOfPlanet(planet),
      planet.index,
      planet.oreRulesVersion,
    )
  }
  return lastParams
}

/**
 * The one-slot cache's key: a legacy and a stamped planet of one seed and index differ, and so do
 * two systems' planets of one index (ticket 759).
 */
function isPlanetOfParams(planet: SessionPlanet, params: PlanetParams): boolean {
  const isSamePlace = params.worldSeed === planet.seed && params.planetIndex === planet.index
  const isSameSystem = params.system === planet.system
  return isSamePlace && isSameSystem && params.oreRulesVersion === planet.oreRulesVersion
}

export function dockSiteOfPlanet(planet: SessionPlanet): DockSite | null {
  const params = planetParamsOf(planet)
  return params === null ? null : dockSiteOf(params)
}

function isGeneratablePlanet(planet: SessionPlanet): boolean {
  const isUint32Seed = Number.isInteger(planet.seed) && planet.seed >= 0 && planet.seed < TWO_TO_32
  const isIndex = Number.isSafeInteger(planet.index) && planet.index >= 1
  const isRules = isKnownOreRulesVersion(planet.oreRulesVersion)
  return isUint32Seed && isIndex && isRules && isInGeneratedSystem(planet)
}

/** A later system holds the campaign indexes past its systems before (ticket 759). */
function isInGeneratedSystem(planet: SessionPlanet): boolean {
  return isPlanetOfSystem(systemOfPlanet(planet), planet.index)
}

/** Vehicle commands need a world to act in. */
export function noPlanetRejection(planet: SessionPlanet): Rejection | null {
  if (planetParamsOf(planet) !== null) return null
  return rejectionOf('no_planet', `planet ${planet.index} has no generated world`)
}
