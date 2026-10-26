import { describe, expect, it } from 'vitest'
import { GEM_OVERLAYS, type GemOverlayCatalogue } from '../../../systems/render/gemOverlays'
import { planetsBefore } from '../../../systems/starMap/campaignIndex'
import {
  GENERATED_POOLS_ORE_RULES,
  GEM_OVERLAY_WALK_ORE_RULES,
  ORE_RULES_VERSION,
} from '../../../systems/world/planetParams'
import { lookGroupAt, planetsPerSystem } from '../../solar-systems'
import golden from '../gemCutPicks.golden.json'
import walkedGolden from '../gemCutPicks.rules15.golden.json'
import cutsFile from '../gemCuts.json'
import { GEM_CUT_LIBRARY, loadGemCutLibrary, type GemCutLibrary } from './gemCutLibrary'
import {
  overlayRoomProblems,
  planetGemCutsOf,
  planetGemOverlayOf,
  type PlanetAddress,
} from './gemCutPick'

// Ticket 889: the pick is a pure function of (seed, s, p, slot); the library is append-only, so
// adding cuts never changes an existing pick (the golden pins picks for fixed addresses); the
// overlay is chosen from data by (s, p) and is one per planet. Ticket 890 (GD lock of 26 Oct): from
// ore rules 15 the overlay walks to one no other planet of the look group lays, a pure function of
// (seed, s, p, look group) bounded by the catalogue; rules-14 picks keep their golden.

const SEED = golden.worldSeed
const STAMP = golden.oreRulesVersion
const SLOTS = golden.slots

function addressOf(system: string, place: string, worldSeed = SEED): PlanetAddress {
  return { worldSeed, system: BigInt(system), place: BigInt(place) }
}

function picksOf(address: PlanetAddress, library: GemCutLibrary = GEM_CUT_LIBRARY) {
  return Object.fromEntries(planetGemCutsOf(address, SLOTS, STAMP, library))
}

function overlayOf(address: PlanetAddress, oreRulesVersion = STAMP): string {
  return planetGemOverlayOf(address, lookGroupAt(address.system, address.place), oreRulesVersion).id
}

/** The shipped library with one more cut, which waits for the next ore rules version. */
const APPENDED = loadGemCutLibrary({
  ...cutsFile,
  cuts: [
    ...cutsFile.cuts,
    { id: 'gem-cut.late', name: 'Late', since: ORE_RULES_VERSION + 1, shape: 'a stone' },
  ],
})

describe('gem cut picks (ticket 889)', () => {
  it('pins the cuts and overlay of fixed addresses under ore rules 14, so an existing pick never moves', () => {
    expect(STAMP).toBe(GENERATED_POOLS_ORE_RULES)
    for (const planet of golden.planets) {
      const address = addressOf(planet.system, planet.place)
      expect(picksOf(address), `${planet.system}.${planet.place}`).toEqual(planet.cuts)
      expect(overlayOf(address), `${planet.system}.${planet.place}`).toBe(planet.overlay)
    }
  })

  it('keeps every pinned pick when a cut is appended, since the new cut waits for the next ore rules version', () => {
    for (const planet of golden.planets) {
      expect(picksOf(addressOf(planet.system, planet.place), APPENDED)).toEqual(planet.cuts)
    }
    const later = planetGemCutsOf(addressOf('1', '6'), SLOTS, ORE_RULES_VERSION + 1, APPENDED)
    expect(later.size).toBe(SLOTS.length)
  })

  it('gives the gems of one planet three different cuts, and the same cuts on every read', () => {
    for (const planet of golden.planets) {
      const cuts = Object.values(picksOf(addressOf(planet.system, planet.place)))
      expect(new Set(cuts).size).toBe(SLOTS.length)
    }
    expect(picksOf(addressOf('1', '8'))).toEqual(picksOf(addressOf('1', '8')))
  })

  it('draws from the world seed and the address alone: another seed or address draws apart, a shared g does not matter', () => {
    const p6 = picksOf(addressOf('1', '6'))
    expect(picksOf(addressOf('1', '6', 42))).not.toEqual(p6)
    // System 1's P6 and system 2's p1 share g = 6 (#781) and still draw their own cuts and overlay.
    const s2p1 = addressOf('2', '1')
    expect([picksOf(s2p1), overlayOf(s2p1, ORE_RULES_VERSION)]).not.toEqual([
      p6,
      overlayOf(addressOf('1', '6'), ORE_RULES_VERSION),
    ])
  })

  it('picks no cut for a planet stamped before the library, so its gems keep the shader look', () => {
    expect(planetGemCutsOf(addressOf('1', '6'), SLOTS, 13).size).toBe(0)
    expect(planetGemCutsOf(addressOf('1', '6'), SLOTS, undefined).size).toBe(0)
  })

  it('picks one overlay of the catalogue per planet, spread over the catalogue across planets', () => {
    const overlays = new Set(
      Array.from({ length: 40 }, (_, at) => overlayOf(addressOf('1', `${at + 6}`))),
    )
    expect(overlays.size).toBeGreaterThan(GEM_OVERLAYS.overlays.length / 2)
    for (const id of overlays) expect(GEM_OVERLAYS.overlays.map((row) => row.id)).toContain(id)
  })
})

/** The walk's seeds: the HS's edge seeds and the species audit's two (ticket 890, HS 4). */
const WALK_SEEDS: readonly number[] = [0, 1, 83921, 4294967295]
const FIRST_GENERATED_PLACE = 6
const LAST_AUDITED_PLACE = 40
const WALK_SYSTEMS: readonly bigint[] = [2n, 3n, 40n, 1_000_000n]

/** System 1's look groups from P6 to P40, then each later CI system whole. */
function lookGroupsOf(): [system: bigint, places: bigint[]][] {
  const firstSystem = new Map<string, bigint[]>()
  for (let place = FIRST_GENERATED_PLACE; place <= LAST_AUDITED_PLACE; place += 1) {
    const group = lookGroupAt(1n, BigInt(place))
    firstSystem.set(group.join(','), group)
  }
  return [
    ...[...firstSystem.values()].map((group): [bigint, bigint[]] => [1n, group]),
    ...WALK_SYSTEMS.map((system): [bigint, bigint[]] => [system, lookGroupAt(system, 1n)]),
  ]
}

/** The walked overlay of each of `reads`, every one of them a place of the group `places`. */
function walkedOverlaysOf(
  worldSeed: number,
  system: bigint,
  places: readonly bigint[],
  reads: readonly bigint[] = places,
): string[] {
  return reads.map(
    (place) =>
      planetGemOverlayOf({ worldSeed, system, place }, places, GEM_OVERLAY_WALK_ORE_RULES).id,
  )
}

/** The system holding campaign index `g` past system 1, and system 1's own planet at `g`. */
function groupSizesAt(g: bigint): number[] {
  const system = (g - 1n) / BigInt(planetsPerSystem()) + 1n
  const place = g - planetsBefore(system)
  return [lookGroupAt(1n, g).length, lookGroupAt(system, place).length]
}

describe('gem overlay walk (ticket 890)', () => {
  it('pins the cuts and walked overlay of fixed addresses under ore rules 15', () => {
    expect(walkedGolden.oreRulesVersion).toBe(GEM_OVERLAY_WALK_ORE_RULES)
    for (const planet of walkedGolden.planets) {
      const address = addressOf(planet.system, planet.place)
      const label = `${planet.system}.${planet.place}`
      expect(
        Object.fromEntries(planetGemCutsOf(address, SLOTS, GEM_OVERLAY_WALK_ORE_RULES)),
        label,
      ).toEqual(planet.cuts)
      expect(overlayOf(address, GEM_OVERLAY_WALK_ORE_RULES), label).toBe(planet.overlay)
    }
  })

  it.each(WALK_SEEDS)(
    'lays no overlay twice in a look group on seed %i: system 1 P6 to P40, systems 2, 3, 40 and 1e6',
    (seed) => {
      for (const [system, places] of lookGroupsOf()) {
        const overlays = walkedOverlaysOf(seed, system, places)
        expect(new Set(overlays).size, `system ${system} ${places.join(',')}`).toBe(places.length)
      }
    },
  )

  it('reads the group alone: each overlay is the same whatever order the planets are read in', () => {
    for (const [system, places] of lookGroupsOf()) {
      const forward = walkedOverlaysOf(SEED, system, places)
      const backward = walkedOverlaysOf(SEED, system, places, [...places].reverse())
      expect(backward.reverse()).toEqual(forward)
    }
  })

  it("starts each planet's walk at its rules-14 draw, so a group's first planet keeps its overlay", () => {
    for (const [system, places] of lookGroupsOf()) {
      const first = { worldSeed: SEED, system, place: places[0] }
      expect(overlayOf(first, GEM_OVERLAY_WALK_ORE_RULES)).toBe(overlayOf(first, STAMP))
    }
  })

  it('keeps the one draw of a planet stamped 14, whatever its group', () => {
    const p12 = addressOf('1', '12')
    expect(planetGemOverlayOf(p12, [p12.place], STAMP).id).toBe(overlayOf(p12, STAMP))
  })

  it('refuses a look group with more planets than overlays rather than share a look', () => {
    const two: GemOverlayCatalogue = {
      ...GEM_OVERLAYS,
      overlays: GEM_OVERLAYS.overlays.slice(0, 2),
    }
    const address = addressOf('2', '1')
    expect(() =>
      planetGemOverlayOf(address, [1n, 2n, 3n], GEM_OVERLAY_WALK_ORE_RULES, two),
    ).toThrow(/look group of 3 planets/)
    expect(overlayRoomProblems(3, two)).toHaveLength(1)
    expect(overlayRoomProblems(GEM_OVERLAYS.overlays.length)).toEqual([])
  })

  it('has room in the catalogue for every look group, the largest of P6 to P40 and the groups at g = 40 and 1e6', () => {
    const sizes = [
      ...lookGroupsOf().map(([, places]) => places.length),
      ...groupSizesAt(40n),
      ...groupSizesAt(1_000_000n),
    ]
    expect(Math.max(...sizes)).toBeLessThanOrEqual(GEM_OVERLAYS.overlays.length)
    expect(sizes.flatMap((size) => overlayRoomProblems(size))).toEqual([])
  })
})
