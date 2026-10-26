import { describe, expect, it } from 'vitest'
import { ORE_RULES_VERSION } from '../../systems/world/planetParams'
import { BAND_COUNT } from '../../systems/world/planetGeometry'
import { GEM_CUT_LIBRARY, planetGemCutsOf, type GemCutLibrary } from '../gem-cuts'
import { speciesNameOf, type Material } from '../materials'
import { planetSkinProblems } from '../mineral-skins'
import { rarityTiers } from '../ores'
import {
  ciPlanetCases,
  ciPlanetsOf,
  CI_SEEDS,
  cutReadOf,
  cutReadsOfSheet,
  CUT_READ_SCREENS,
  firstSystemPlanetOf,
  systemPlanetOf,
  type CiPlanet,
} from './materialsCiFixtures'
import { generatedPoolOf } from './systems/generatedRoster'
import { planetRosterOf } from './systems/planetRoster'
import { planetSpeciesOf } from './systems/planetSpecies'
import {
  gemReadProblemsAt,
  priceOrderProblemsOf,
  type HeroCellRead,
} from './systems/render/gemRead'
import { gemOverlayOfPlanet } from './systems/render/kindLookProvider'
import {
  planetContactSheetOf,
  unreadablePairsOf,
  type ContactSheetRow,
} from './systems/render/skinContactSheet'

// Ticket 890 (MF of the GD's Materials Expansion lock of 25 Oct): the materials CI of P1 to P5
// (ticket 711's species audit, ticket 746's contact sheet and ticket 785's gem read) on every planet
// the roster can emit from its generated pools: system 1's P6 to P40 and every planet of systems 2,
// 3, 40 and 1e6, over the species audit's two seeds. Each planet shows at least 15 distinct looks,
// keeps its gems in bands 3 to 5 in clusters of at most 3 cells, and grows rarer with depth; every
// address gets its own seed and ids, so addresses sharing a g (#781) still draw their own pools and
// gem looks; appending a cut to the library moves no pick of any planet already stamped; and no two
// species of a planet share a #699 stem (P&N's Q2 ruling). HS row 3, no shared gem look within an
// act, is `roster.gemOverlayWalk.test.ts`'s (ore rules 15).

const CASES = ciPlanetCases()
const LOOK_FLOOR = 15
const GEMS_PER_PLANET = 3
const GEM_BANDS: readonly [number, number] = [3, 5]
const GEM_CLUSTER_CELLS_MAX = 3
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)
/** Shared g by design (#781): system 1's P6 and system 2's p1 (g = 6), P11 and system 3's p1. */
const SHARED_G_PAIRS: readonly [place: number, system: number][] = [
  [6, 2],
  [11, 3],
]

/** The shipped library with one more cut, which waits for the next ore rules version (ticket 889). */
const APPENDED: GemCutLibrary = {
  cuts: [
    ...GEM_CUT_LIBRARY.cuts,
    { id: 'gem-cut.late', name: 'Late', since: ORE_RULES_VERSION + 1, shape: 'a stone' },
  ],
}

function sheetOf(planet: CiPlanet) {
  return planetContactSheetOf(planet.params)
}

function gemRowsOf(planet: CiPlanet): ContactSheetRow[] {
  return sheetOf(planet).rows.filter((row) => row.gemRank !== null)
}

/** What the player sees of a kind on frame 1: sprite, hue and, for a gem, its library cut. */
function lookKeyOf(row: ContactSheetRow): string {
  return `${row.silhouetteCode}|${row.patternCode}|${row.colour}|${row.gemCut ?? ''}`
}

function speciesOfPlanet(planet: CiPlanet): Material[] {
  return planetRosterOf(planet.params)
    .map((_, index) => planetSpeciesOf(planet.params, index + 1))
    .filter((species): species is Material => species !== null)
}

function repeatsOf(keys: readonly string[]): string[] {
  return keys.filter((key, index) => keys.indexOf(key) !== index)
}

function leadOfRarity(rarity: string): number {
  return rarityTiers().findIndex((tier) => tier.id === rarity)
}

/** The rarity leads of the roster's kinds live in `band`, as the fold draws them. */
function liveLeadsIn(planet: CiPlanet, band: number): number[] {
  return planetRosterOf(planet.params)
    .filter((kind) => kind.window[0] <= band && band <= kind.window[1])
    .map((kind) => leadOfRarity(kind.rarity))
}

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Each band's value after the band before it, so a fall shows as a negative step. */
function stepsOf(values: readonly number[]): number[] {
  return values.slice(1).map((value, at) => value - values[at])
}

function gemSlotIdsOf(planet: CiPlanet): string[] {
  return generatedPoolOf(planet.params)
    .kinds.filter((kind) => kind.gemSaleTier !== null)
    .map((kind) => kind.id)
}

function gemCutsOfLibrary(planet: CiPlanet, library: GemCutLibrary): string[] {
  const address = {
    worldSeed: planet.params.worldSeed,
    system: planet.system,
    place: BigInt(planet.place),
  }
  return [...planetGemCutsOf(address, gemSlotIdsOf(planet), ORE_RULES_VERSION, library).values()]
}

/** A planet's gem look: its gems' cuts and hues and the overlay it lays over them. */
function gemLookOf(planet: CiPlanet) {
  return {
    gems: gemRowsOf(planet).map((row) => `${row.gemCut ?? ''} ${row.colour}`),
    overlay: gemOverlayOfPlanet(planet.params)?.id,
  }
}

function lookKeysOfPool(planet: CiPlanet): string[] {
  return sheetOf(planet).rows.map((row) => `${row.speciesId} ${lookKeyOf(row)}`)
}

function kindIdsOf(planet: CiPlanet): string[] {
  return planetRosterOf(planet.params).map((kind) => kind.slotId)
}

describe('materials CI of every generated planet (ticket 890)', () => {
  it('reads system 1 P6 to P40 and the five planets of systems 2, 3, 40 and 1e6 on both seeds', () => {
    expect(CASES).toHaveLength(CI_SEEDS.length * (35 + 4 * 5))
    expect(CASES.map(([, planet]) => planet.params.oreRulesVersion)).toEqual(
      CASES.map(() => ORE_RULES_VERSION),
    )
  })

  describe('contact sheet (ticket 746)', () => {
    it.each(CASES)('skins every kind slot of %s', (_, planet) => {
      const sheet = sheetOf(planet)
      expect(sheet.unskinned).toEqual([])
      expect(sheet.rows).toHaveLength(planetRosterOf(planet.params).length)
    })

    it.each(CASES)('tells every kind of %s apart from each of its other kinds', (_, planet) => {
      expect(unreadablePairsOf(sheetOf(planet))).toEqual([])
    })

    it.each(CASES)('shows at least 15 distinct looks on %s', (_, planet) => {
      const looks = new Set(sheetOf(planet).rows.map(lookKeyOf))
      expect(looks.size).toBeGreaterThanOrEqual(LOOK_FLOOR)
    })
  })

  describe('species audit (ticket 711)', () => {
    it.each(CASES)('draws at least 15 species on %s', (_, planet) => {
      const ids = new Set(speciesOfPlanet(planet).map((species) => species.id))
      expect(ids.size).toBeGreaterThanOrEqual(LOOK_FLOOR)
    })

    it.each(CASES)('gives every species of %s its own name', (_, planet) => {
      const names = speciesOfPlanet(planet).map((species) =>
        speciesNameOf(species.epithet).toLowerCase(),
      )
      expect(repeatsOf(names)).toEqual([])
    })

    it.each(CASES)('gives every species of %s its own #699 stem', (_, planet) => {
      const stems = speciesOfPlanet(planet).map(
        (species) => speciesNameOf(species.epithet).toLowerCase().split(/[\s-]/)[0],
      )
      expect(repeatsOf(stems)).toEqual([])
    })

    it.each(CASES)('gives every species of %s its own sprite', (_, planet) => {
      const sprites = speciesOfPlanet(planet).map(
        (species) => `${species.silhouette}|${species.pattern}`,
      )
      expect(repeatsOf(sprites)).toEqual([])
    })

    it.each(CASES)('dresses no two species of %s in one skin', (_, planet) => {
      expect(planetSkinProblems(planet.params)).toEqual([])
    })
  })

  describe('gem read (ticket 785)', () => {
    it.each(CASES)(
      'draws the three gems of %s from three library cuts, each read as a faceted gem with a highlight at 24 px, 360 px and 1280+',
      (_, planet) => {
        const gems = gemRowsOf(planet)
        expect(gems).toHaveLength(GEMS_PER_PLANET)
        expect(new Set(gems.map((gem) => gem.gemCut)).size).toBe(GEMS_PER_PLANET)
        for (const gem of gems) {
          expect(gem.heroCell).not.toBeNull()
          const read = cutReadOf(gem.gemCut ?? '')
          const neutral: HeroCellRead = { ...read, speciesId: gem.speciesId }
          expect(gemReadProblemsAt(neutral, CUT_READ_SCREENS)).toEqual([])
          expect(
            gemReadProblemsAt({ ...neutral, screens: read.dimmestTint }, CUT_READ_SCREENS),
          ).toEqual([])
        }
      },
    )

    it.each(CASES)(
      'scores no cheaper gem of %s above a pricier one, nor under its top non-gem',
      (_, planet) => {
        const sheet = sheetOf(planet)
        const reads = cutReadsOfSheet(sheet)
        const problems = CUT_READ_SCREENS.flatMap((screen) =>
          priceOrderProblemsOf(sheet, reads, screen),
        )
        expect(problems).toEqual([])
      },
    )
  })

  describe('gems and depth', () => {
    it.each(CASES)(
      'keeps every gem of %s in bands 3 to 5, in clusters of at most 3 cells',
      (_, planet) => {
        const gems = generatedPoolOf(planet.params).kinds.filter(
          (kind) => kind.gemSaleTier !== null,
        )
        const kinds = planetRosterOf(planet.params)
        expect(gems).toHaveLength(GEMS_PER_PLANET)
        for (const gem of gems) {
          const window = kinds.find((kind) => kind.slotId === gem.id)?.window
          expect(window?.[0]).toBeGreaterThanOrEqual(GEM_BANDS[0])
          expect(window?.[1]).toBeLessThanOrEqual(GEM_BANDS[1])
          expect(gem.clusterCells?.[1]).toBeLessThanOrEqual(GEM_CLUSTER_CELLS_MAX)
        }
      },
    )

    it.each(CASES)(
      'grows rarer with depth on %s: the mean and the rarest live kind never fall band to band',
      (_, planet) => {
        const leads = BANDS.map((band) => liveLeadsIn(planet, band))
        const means = leads.map(meanOf)
        const rarest = leads.map((band) => Math.max(...band))
        expect(stepsOf(means).filter((step) => step < 0)).toEqual([])
        expect(stepsOf(rarest).filter((step) => step < 0)).toEqual([])
        expect(means[BAND_COUNT - 1]).toBeGreaterThan(means[0])
      },
    )
  })

  describe('address uniqueness (Progression, accepted by the HS)', () => {
    it.each(CI_SEEDS)(
      'gives every address the roster emits its own world seed on seed %i',
      (seed) => {
        const firstFive = [1, 2, 3, 4, 5].map((place) => firstSystemPlanetOf(seed, place))
        const seeds = [...firstFive, ...ciPlanetsOf(seed)].map((planet) => planet.params.planetSeed)
        expect(repeatsOf(seeds.map(String))).toEqual([])
      },
    )

    it.each(CI_SEEDS)(
      'gives every generated address its own kind ids, system<s>-p<p>-<slot>, on seed %i',
      (seed) => {
        const planets = ciPlanetsOf(seed)
        for (const planet of planets) {
          const prefix = `system${planet.system}-p${planet.place}-`
          expect(kindIdsOf(planet).filter((id) => !id.startsWith(prefix))).toEqual([])
        }
        expect(repeatsOf(planets.flatMap(kindIdsOf))).toEqual([])
      },
    )

    it.each(
      CI_SEEDS.flatMap((seed) =>
        SHARED_G_PAIRS.map(([place, system]): [number, number, number] => [seed, place, system]),
      ),
    )(
      'draws another pool and other gem looks on seed %i for system 1 P%i and planet 1 of system %i, which share g',
      (seed, place, system) => {
        const first = firstSystemPlanetOf(seed, place)
        const later = systemPlanetOf(seed, BigInt(system), 1)
        expect(first.params.planetIndex).toBe(later.params.planetIndex)
        expect(lookKeysOfPool(first)).not.toEqual(lookKeysOfPool(later))
        expect(gemLookOf(first)).not.toEqual(gemLookOf(later))
      },
    )
  })

  describe('append-only gem-cut library (ticket 889)', () => {
    it.each(CASES)(
      'keeps every gem pick of %s when a cut is appended to the library',
      (_, planet) => {
        const drawn = gemRowsOf(planet).map((row) => row.gemCut)
        expect(gemCutsOfLibrary(planet, GEM_CUT_LIBRARY)).toEqual(drawn)
        expect(gemCutsOfLibrary(planet, APPENDED)).toEqual(drawn)
      },
    )
  })
})
