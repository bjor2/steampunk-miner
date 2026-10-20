import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { freshPlanetParamsFor } from '../../../systems/world/planetParams'
import { planetRosterOf, planetSpeciesOf } from '../../roster'
import type { SkinRow } from './skinLayers'
import { planetSkinProblems, planetSkinsOf, seenSkinOf, skinOfSpecies } from './mineralSkin'
import type { SkinTable } from './skinTable'

// The layered skin generator of ticket 591 (#576): a skin stacks the four layers its species' row
// chooses, a planet's skins follow its roster through its pool (ticket 542), and a player sees a
// skin only once they have met the species (ticket 546).

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
function tableOf(skins: readonly SkinRow[]): SkinTable {
  const layers = { base: ['glassy', 'granular'], vein: ['brass-thread'], palette: ['umber'] }
  return { layers: { ...layers, sheen: ['dull'] }, skins, ramps: new Map() }
}

/** A codex stand-in that has met exactly the listed species. */
function metSlice(speciesIds: readonly string[]): SliceDefinition {
  return {
    id: 'met-probe',
    register: (r) =>
      r.discovery({
        id: 'met-probe.discovery',
        hasDiscovered: (_state, _playerId, key) =>
          speciesIds.some((id) => key === `material:${id}`),
      }),
  }
}

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

  it('shows a skin only once the player has met its species', () => {
    const [met, unmet] = [speciesIdAt(1, 1), speciesIdAt(1, 2)]
    const table = tableOf([skinRow(met), skinRow(unmet, 'glassy')])
    const params = freshPlanetParamsFor(SEED, 1)
    const state = readAuthorityState()
    const { playerId } = useGameStore.getState()
    expect(seenSkinOf(state, playerId, params, 1, table)).toBeNull()
    withRegistrations([metSlice([met])], () => {
      expect(seenSkinOf(state, playerId, params, 1, table)?.speciesId).toBe(met)
      expect(seenSkinOf(state, playerId, params, 2, table)).toBeNull()
    })
  })
})
