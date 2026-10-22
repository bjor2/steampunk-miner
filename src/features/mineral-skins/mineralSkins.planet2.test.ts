import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import {
  freshPlanetParamsFor,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
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
// wears a skin of its own. Under the same rules slots 6, 7 and 12 swap species (ticket 736: azurite
// nodule, pyrite sun, argentite), which that ticket skins, while a P2 entered under rules 8 keeps the
// retired three in their own skins. A P2 entered before that pool, under ore rules 5, keeps the legacy
// species, so it keeps the skins planet 1 shows.

const SEED = 83921
const PLANET_2 = freshPlanetParamsFor(SEED, 2)
const SKINNED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
/** P2's own kinds of ticket 709, roster slots 13 to 15, skinned by ticket 710. */
const OWN_SLOTS = [13, 14, 15]
/** The slots whose species swap under ore rules 9 (ticket 736), skinned by the same ticket. */
const SWAPPED_SLOTS = [6, 7, 12]
/** The ore rules of the swap: a P2 entered under rules 8 keeps the retired three and their skins. */
const RULES_BEFORE_SWAP = 8
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

  it('skins every kind slot of the planet, its own three and the three swapped in included', () => {
    expect(skinnedSpeciesOf(PLANET_2)).toEqual(
      SKINNED_SLOTS.map((kindSlot) => planetSpeciesOf(PLANET_2, kindSlot)?.id),
    )
  })

  it.each(SWAPPED_SLOTS)(
    'gives the species swapped into slot %i layers no other P2 species wears',
    (kindSlot) => {
      const skins = planetSkinsOf(PLANET_2)
      const swapped = skins[kindSlot - 1]
      const wornByOthers = skins
        .filter((skin) => skin !== null && skin.speciesId !== swapped?.speciesId)
        .flatMap((skin) => skin?.layers ?? [])
      for (const kind of ['base', 'vein', 'palette', 'sheen'] as const) {
        expect(wornByOthers).not.toContainEqual(expect.objectContaining(layerOf(swapped, kind)))
      }
    },
  )

  it('keeps the retired species and their skins on a planet 2 entered before the swap', () => {
    const older = planetParamsFor(SEED, 2, RULES_BEFORE_SWAP)
    const retired = SWAPPED_SLOTS.map((kindSlot) => planetSkinsOf(older)[kindSlot - 1]?.speciesId)
    expect(retired).toEqual(['p2-u1', 'p2-u2', 'p2-r3'])
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
