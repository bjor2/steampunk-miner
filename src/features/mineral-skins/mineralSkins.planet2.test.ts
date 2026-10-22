import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import { planetSpeciesOf } from '../roster'
import { planetSkinsOf } from './systems/mineralSkin'
import type { MineralSkin, SkinLayer, SkinLayerKind } from './systems/skinLayers'

// The P2 batches of #576 (tickets 595 to 597), re-scoped by the GD lock (b) on #595: planet 2's own
// species by roster slot, five a ticket, from the foothold-p2 pool of ticket 632 on the legacy kind
// slots. Ticket 595 skins slots 1 to 5, the pool's five commons (slate shale, rust ochre, tin
// gravel, sulphur crust, graphite seam); ticket 596 slots 6 to 9, its four uncommons (cobalt bloom,
// bismuth stair, moonstone lens, galena cube); ticket 597 slots 10 to 12, its three rares (star
// garnet, verdigris opal, smoke diamond). Under ore rules 9 the pool adds its own slots 13 to 15
// (ticket 709: cinnabar, aquamarine, jet), which ticket 710 skins, so every kind slot of a fresh P2
// wears a skin of its own. A P2 entered before that pool, under ore rules 5, keeps the legacy
// species, so it keeps the skins planet 1 shows.

const SEED = 83921
const PLANET_2 = freshPlanetParamsFor(SEED, 2)
/** Slots 6, 7 and 12 swap species under ore rules 9 (ticket 736) and wait for their skins. */
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15]
/** P2's own kinds of ticket 709, roster slots 13 to 15, skinned by ticket 710. */
const OWN_SLOTS = [13, 14, 15]
/** The ore rules a P2 world was entered under before its own pool (ticket 632). */
const RULES_BEFORE_P2_POOL = 5

function planet2EnteredUnderRules5(): PlanetParams {
  const fresh = createAuthorityState({ planetIndex: 2, planetSeed: SEED, playerIds: ['p1'] })
  return planetParamsOf({ ...fresh.planet, oreRulesVersion: RULES_BEFORE_P2_POOL }) as PlanetParams
}

function skinnedSpeciesOf(params: PlanetParams): (string | null)[] {
  return planetSkinsOf(params).map((skin) => skin?.speciesId ?? null)
}

function layerOf(skin: MineralSkin | null, kind: SkinLayerKind): SkinLayer {
  const layer = skin?.layers.find((candidate) => candidate.kind === kind)
  if (layer === undefined) throw new Error(`no ${kind} layer on ${skin?.speciesId}`)
  return layer
}

describe('mineral skins of planet 2', () => {
  it.each(SKINNED_SLOTS)('skins the own species of kind slot %i', (kindSlot) => {
    const species = planetSpeciesOf(PLANET_2, kindSlot)
    expect(species?.pool).toBe('foothold-p2')
    expect(planetSkinsOf(PLANET_2)[kindSlot - 1]?.speciesId).toBe(species?.id)
  })

  it('skins every kind slot of the planet but the three swapped ones, its own three included', () => {
    const skinnedOrNull = (kindSlot: number) =>
      SKINNED_SLOTS.includes(kindSlot) ? planetSpeciesOf(PLANET_2, kindSlot)?.id : null
    expect(skinnedSpeciesOf(PLANET_2)).toEqual(
      planetSkinsOf(PLANET_2).map((_, at) => skinnedOrNull(at + 1)),
    )
  })

  it.each(OWN_SLOTS)(
    'gives the own kind of slot %i layers no other P2 species wears',
    (kindSlot) => {
      const skins = planetSkinsOf(PLANET_2)
      const own = skins[kindSlot - 1]
      expect(own?.speciesId).toBe(planetSpeciesOf(PLANET_2, kindSlot)?.id)
      const wornByOthers = skins
        .filter((skin) => skin !== null && skin.speciesId !== own?.speciesId)
        .flatMap((skin) => skin?.layers ?? [])
      expect(wornByOthers).not.toContainEqual(expect.objectContaining(layerOf(own, 'base')))
      expect(wornByOthers).not.toContainEqual(expect.objectContaining(layerOf(own, 'vein')))
      expect(wornByOthers).not.toContainEqual(expect.objectContaining(layerOf(own, 'palette')))
      expect(wornByOthers).not.toContainEqual(expect.objectContaining(layerOf(own, 'sheen')))
    },
  )

  it('keeps the skins planet 1 shows on a planet 2 entered before its own pool', () => {
    expect(skinnedSpeciesOf(planet2EnteredUnderRules5())).toEqual(
      skinnedSpeciesOf(freshPlanetParamsFor(SEED, 1)),
    )
  })
})
