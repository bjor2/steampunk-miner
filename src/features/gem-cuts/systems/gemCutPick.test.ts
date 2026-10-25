import { describe, expect, it } from 'vitest'
import { GEM_OVERLAYS } from '../../../systems/render/gemOverlays'
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import golden from '../gemCutPicks.golden.json'
import cutsFile from '../gemCuts.json'
import { GEM_CUT_LIBRARY, loadGemCutLibrary, type GemCutLibrary } from './gemCutLibrary'
import { planetGemCutsOf, planetGemOverlayOf, type PlanetAddress } from './gemCutPick'

// Ticket 889: the pick is a pure function of (seed, s, p, slot); the library is append-only, so
// adding cuts never changes an existing pick (the golden pins picks for fixed addresses); the
// overlay is chosen from data by (s, p) and is one per planet.

const SEED = golden.worldSeed
const STAMP = golden.oreRulesVersion
const SLOTS = golden.slots

function addressOf(system: string, place: string, worldSeed = SEED): PlanetAddress {
  return { worldSeed, system: BigInt(system), place: BigInt(place) }
}

function picksOf(address: PlanetAddress, library: GemCutLibrary = GEM_CUT_LIBRARY) {
  return Object.fromEntries(planetGemCutsOf(address, SLOTS, STAMP, library))
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
  it('pins the cuts and overlay of fixed addresses, so an existing pick never moves', () => {
    for (const planet of golden.planets) {
      const address = addressOf(planet.system, planet.place)
      expect(picksOf(address), `${planet.system}.${planet.place}`).toEqual(planet.cuts)
      expect(planetGemOverlayOf(address).id, `${planet.system}.${planet.place}`).toBe(
        planet.overlay,
      )
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
    expect([picksOf(s2p1), planetGemOverlayOf(s2p1).id]).not.toEqual([
      p6,
      planetGemOverlayOf(addressOf('1', '6')).id,
    ])
  })

  it('picks no cut for a planet stamped before the library, so its gems keep the shader look', () => {
    expect(planetGemCutsOf(addressOf('1', '6'), SLOTS, 13).size).toBe(0)
    expect(planetGemCutsOf(addressOf('1', '6'), SLOTS, undefined).size).toBe(0)
  })

  it('picks one overlay of the catalogue per planet, spread over the catalogue across planets', () => {
    const overlays = new Set(
      Array.from({ length: 40 }, (_, at) => planetGemOverlayOf(addressOf('1', `${at + 6}`)).id),
    )
    expect(overlays.size).toBeGreaterThan(GEM_OVERLAYS.overlays.length / 2)
    for (const id of overlays) expect(GEM_OVERLAYS.overlays.map((row) => row.id)).toContain(id)
  })
})
