/**
 * The planets the materials CI reads (ticket 890, MF of the GD's Materials Expansion lock of 25 Oct):
 * every planet the roster can emit from its generated pools, system 1's P6 to P40 and the five
 * planets of systems 2, 3, 40 and 1e6, and the gem-cut library's committed reads (ticket 889) keyed
 * as the gem-read rule of ticket 785 takes them. Test fixtures only.
 */
import { readFileSync } from 'node:fs'
import { planetsBefore } from '../../systems/starMap/campaignIndex'
import { planetParamsAt } from '../../systems/starMap/systemPlanetParams'
import {
  freshPlanetParamsFor,
  ORE_RULES_VERSION,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import type { HeroCellRead, HeroReads } from './systems/render/gemRead'
import type { PlanetContactSheet } from './systems/render/skinContactSheet'

/** One planet the CI reads: `<s>.<p>` and its fresh params under the newest ore rules. */
export interface CiPlanet {
  label: string
  system: bigint
  place: number
  params: PlanetParams
}

/** The species audit's two seeds: the roster's first named seed and the largest 32-bit one. */
export const CI_SEEDS: readonly number[] = [83921, 4294967295]
export const FIRST_GENERATED_PLACE = 6
export const LAST_AUDITED_PLACE = 40
/** The later systems the CI reads (#890: s = 2, 3, 40 and 1e6), every planet of each. */
export const CI_SYSTEMS: readonly bigint[] = [2n, 3n, 40n, 1_000_000n]
export const PLANETS_PER_SYSTEM = 5

/** System 1's planet, fresh, or under `oreRulesVersion` where one is named (ticket 890: 14 vs 15). */
export function firstSystemPlanetOf(
  worldSeed: number,
  place: number,
  oreRulesVersion?: number,
): CiPlanet {
  const params =
    oreRulesVersion === undefined
      ? freshPlanetParamsFor(worldSeed, place)
      : planetParamsFor(worldSeed, place, oreRulesVersion)
  return { label: `1.${place}`, system: 1n, place, params }
}

export function systemPlanetOf(
  worldSeed: number,
  system: bigint,
  place: number,
  oreRulesVersion = ORE_RULES_VERSION,
): CiPlanet {
  const campaignIndex = Number(planetsBefore(system)) + place
  return {
    label: `${system}.${place}`,
    system,
    place,
    params: planetParamsAt(worldSeed, system, campaignIndex, oreRulesVersion),
  }
}

/** System 1's P6 to P40, then every planet of each later CI system, in that order. */
export function ciPlanetsOf(worldSeed: number, oreRulesVersion = ORE_RULES_VERSION): CiPlanet[] {
  const firstSystem = Array.from(
    { length: LAST_AUDITED_PLACE - FIRST_GENERATED_PLACE + 1 },
    (_, at) => firstSystemPlanetOf(worldSeed, FIRST_GENERATED_PLACE + at, oreRulesVersion),
  )
  const later = CI_SYSTEMS.flatMap((system) =>
    Array.from({ length: PLANETS_PER_SYSTEM }, (_, at) =>
      systemPlanetOf(worldSeed, system, at + 1, oreRulesVersion),
    ),
  )
  return [...firstSystem, ...later]
}

/** Every CI planet of every CI seed, labelled with its seed for `it.each`. */
export function ciPlanetCases(): [label: string, planet: CiPlanet][] {
  return CI_SEEDS.flatMap((seed) =>
    ciPlanetsOf(seed).map((planet): [string, CiPlanet] => [`${planet.label} seed ${seed}`, planet]),
  )
}

/** One cut's committed measures (`docs/art/gem-cuts/cut_post.py`): neutral and in the dimmest hue. */
export interface CutRead {
  cutId: string
  cellSha256: string
  screens: HeroCellRead['screens']
  dimmestTint: HeroCellRead['screens']
}

export interface CutReads {
  screens: Record<string, number>
  cuts: CutRead[]
}

/** The library's three read screens: 24 px on a landscape phone, 360 px and 1280+ (ticket 889). */
export const CUT_READ_SCREENS = ['640x360', '360x640', '1280x800']
export const GEM_CUTS_ART = new URL('../../../docs/art/gem-cuts/', import.meta.url)
export const CUT_READS = JSON.parse(
  readFileSync(new URL('gem-cut-reads.json', GEM_CUTS_ART), 'utf8'),
) as CutReads

export function cutReadOf(cutId: string): CutRead {
  const read = CUT_READS.cuts.find((cut) => cut.cutId === cutId)
  if (read === undefined) throw new Error(`${cutId} has no read in gem-cut-reads.json`)
  return read
}

/** The cut reads keyed by the species that draws each, so the price-order rule can read them. */
export function cutReadsOfSheet(sheet: PlanetContactSheet): HeroReads {
  return {
    screens: CUT_READS.screens,
    heroes: sheet.rows
      .filter((row) => row.gemRank !== null)
      .map((row) => ({ ...cutReadOf(row.gemCut ?? ''), speciesId: row.speciesId })),
  }
}
