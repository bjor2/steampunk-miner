import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { freshPlanetParamsFor } from '../../../systems/world/planetParams'
import { planetRosterOf, planetSpeciesOf } from '../../roster'
import { oreTierOf } from '../../ores'
import type { SignatureSkinRow, SkinRow } from './skinLayers'
import {
  planetSkinProblems,
  planetSkinsOf,
  seenSignatureSkinOf,
  signatureSkinOf,
  skinOfKindSlot,
  skinOfSpecies,
} from './mineralSkin'
import type { SkinTable } from './skinTable'

// The layered skin generator of ticket 591 (#576): a skin stacks the four layers its species' row
// chooses, a planet's skins follow its roster through its pool (ticket 542), and a species' skin
// shows before the player has met it (ticket 698). A planet's signature material wears its
// planet's signature skin, seen once its ore is met (ticket 603).

const SEED = 83921

function speciesIdAt(planetIndex: number, kindSlot: number): string {
  const species = planetSpeciesOf(freshPlanetParamsFor(SEED, planetIndex), kindSlot)
  if (species === null) throw new Error(`planet ${planetIndex} binds no species to ${kindSlot}`)
  return species.id
}

function skinRow(species: string, base = 'granular'): SkinRow {
  return { species, base, vein: 'brass-thread', palette: 'umber', sheen: 'dull' }
}

/** A table literal, past the loader's guards, so the planet check is tried on its own. */
function tableOf(
  skins: readonly SkinRow[],
  signatures: readonly SignatureSkinRow[] = [],
): SkinTable {
  const layers = { base: ['glassy', 'granular'], vein: ['brass-thread'], palette: ['umber'] }
  return { layers: { ...layers, sheen: ['dull'] }, skins, signatures, ramps: new Map() }
}

function signatureRow(planet: number, base = 'granular'): SignatureSkinRow {
  return { planet, base, vein: 'brass-thread', palette: 'umber', sheen: 'dull' }
}

/** A codex stand-in that has discovered exactly the listed keys. */
function metKeysSlice(keys: readonly string[]): SliceDefinition {
  return {
    id: 'met-probe',
    register: (r) =>
      r.discovery({
        id: 'met-probe.discovery',
        hasDiscovered: (_state, _playerId, key) => keys.includes(key),
      }),
  }
}

const RELIC_ON_4 = `relic_t${oreTierOf(4, 5, 0)}`

describe('mineral skin generator', () => {
  beforeEach(() => resetGameStore())

  it('stacks the base, vein, palette and sheen its species row chooses, bottom first', () => {
    const table = tableOf([skinRow('ironstone-brassvein')])
    expect(skinOfSpecies('ironstone-brassvein', table)).toEqual({
      speciesId: 'ironstone-brassvein',
      layers: [
        { kind: 'base', id: 'granular' },
        { kind: 'vein', id: 'brass-thread' },
        { kind: 'palette', id: 'umber' },
        { kind: 'sheen', id: 'dull' },
      ],
    })
  })

  it('gives a species no skin while no row skins it', () => {
    expect(skinOfSpecies('ironstone-brassvein', tableOf([]))).toBeNull()
  })

  it("gives each roster slot of a planet its pool's species' skin", () => {
    const first = speciesIdAt(1, 1)
    const params = freshPlanetParamsFor(SEED, 1)
    const skins = planetSkinsOf(params, tableOf([skinRow(first)]))
    expect(skins).toHaveLength(planetRosterOf(params).length)
    expect(skins[0]?.speciesId).toBe(first)
    expect(skins.slice(1).every((skin) => skin === null)).toBe(true)
  })

  it('skins one shared slot with each planet pool’s own species', () => {
    const [onP3, onP4] = [speciesIdAt(3, 1), speciesIdAt(4, 1)]
    const table = tableOf([skinRow(onP3), skinRow(onP4, 'glassy')])
    expect(onP3).not.toBe(onP4)
    expect(planetSkinsOf(freshPlanetParamsFor(SEED, 3), table)[0]?.speciesId).toBe(onP3)
    expect(planetSkinsOf(freshPlanetParamsFor(SEED, 4), table)[0]?.speciesId).toBe(onP4)
  })

  it('gives a planet with no species pool no skins', () => {
    expect(planetSkinsOf(freshPlanetParamsFor(SEED, 8), tableOf([]))).toEqual([])
  })

  it('names two species of one planet that share all four layers', () => {
    const [a, b] = [speciesIdAt(1, 1), speciesIdAt(1, 2)]
    const params = freshPlanetParamsFor(SEED, 1)
    expect(planetSkinProblems(params, tableOf([skinRow(a), skinRow(b)]))).toEqual([
      `${b} shares base granular, vein brass-thread, palette umber, sheen dull with ${a}`,
    ])
    expect(planetSkinProblems(params, tableOf([skinRow(a), skinRow(b, 'glassy')]))).toEqual([])
  })

  it("gives a cell's kind slot its species' skin before the player has met it (ticket 698)", () => {
    const [first, second] = [speciesIdAt(1, 1), speciesIdAt(1, 2)]
    const table = tableOf([skinRow(first), skinRow(second, 'glassy')])
    const params = freshPlanetParamsFor(SEED, 1)
    expect(skinOfKindSlot(params, 1, table)?.speciesId).toBe(first)
    expect(skinOfKindSlot(params, 2, table)?.speciesId).toBe(second)
  })

  it("dresses the planet's signature material in its planet's row", () => {
    const table = tableOf([], [signatureRow(4)])
    expect(signatureSkinOf(freshPlanetParamsFor(SEED, 4), table)).toEqual({
      planetIndex: 4,
      oreTypeId: RELIC_ON_4,
      layers: [
        { kind: 'base', id: 'granular' },
        { kind: 'vein', id: 'brass-thread' },
        { kind: 'palette', id: 'umber' },
        { kind: 'sheen', id: 'dull' },
      ],
    })
    expect(signatureSkinOf(freshPlanetParamsFor(SEED, 3), table)).toBeNull()
  })

  it('names a signature that shares all four layers with a species of its planet', () => {
    const params = freshPlanetParamsFor(SEED, 4)
    const species = speciesIdAt(4, 11)
    expect(planetSkinProblems(params, tableOf([skinRow(species)], [signatureRow(4)]))).toEqual([
      `the signature of planet 4 shares base granular, vein brass-thread, palette umber, sheen dull with ${species}`,
    ])
    const apart = tableOf([skinRow(species)], [signatureRow(4, 'glassy')])
    expect(planetSkinProblems(params, apart)).toEqual([])
  })

  it('shows the signature skin only once the player has met its ore', () => {
    const table = tableOf([], [signatureRow(4)])
    const params = freshPlanetParamsFor(SEED, 4)
    const state = readAuthorityState()
    const { playerId } = useGameStore.getState()
    expect(seenSignatureSkinOf(state, playerId, params, table)).toBeNull()
    withRegistrations([metKeysSlice([`ore:${RELIC_ON_4}`])], () => {
      expect(seenSignatureSkinOf(state, playerId, params, table)?.oreTypeId).toBe(RELIC_ON_4)
    })
  })
})
