import { describe, expect, it } from 'vitest'
import { TITLE_WORDS_MAX } from '../../../constants/uiParts'
import { LOCKED_SCHEDULE, unlockCountThrough } from '../../../systems/unlocks/unlockSchedule'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import { MATERIALS } from '../../materials'
import { planetMaterialPoolOf, planetsPerSystem, rosterPlanetOf } from '../../solar-systems'
import { generatedKitOf, generatedMerchantNameOf, NAME_CHARACTERS_MAX } from './generatedKit'
import { PLANET_KITS } from './planetKitRows'
import type { PlanetKit, PlanetKits, PremiumRule } from './planetKitTypes'

const SEED = 1337
/** s as bigint at 2, 3, 40 and 1e6 (VS row 1, HS condition 2): the systems the palette draws. */
const DRAWN_SYSTEMS = [2n, 3n, 40n, 1_000_000n]
const VARIANTS = ['Assay', 'Scree Yard', 'Gasworks', 'Lapidary', 'Boilerhouse']
const AUTHORED_ITEM_IDS = PLANET_KITS.items.map((item) => item.id)

function placesOfSystem(): bigint[] {
  return Array.from({ length: planetsPerSystem() }, (_, at) => BigInt(at + 1))
}

function drawnKitsOf(systems: readonly bigint[]): PlanetKit[] {
  return systems.flatMap((system) =>
    placesOfSystem().map((planet) => generatedKitOf(SEED, system, planet)!),
  )
}

/** The same planets read last to first, handed back in first-to-last order. */
function drawnKitsReadBackwards(systems: readonly bigint[]): PlanetKit[] {
  const backwards = [...systems].reverse().flatMap((system) =>
    placesOfSystem()
      .reverse()
      .map((planet) => generatedKitOf(SEED, system, planet)!),
  )
  return backwards.reverse()
}

function kitsWithRule(rule: PremiumRule): PlanetKits {
  return {
    ...PLANET_KITS,
    familyKits: {
      rows: PLANET_KITS.familyKits.rows.map((row) => ({ ...row, premiumRule: rule })),
      noFamily: { premiumRule: rule, itemId: null },
    },
  }
}

describe('generated planet kits (ticket 824)', () => {
  it('gives planets 1 to 5 exactly their authored kits', () => {
    const kits = placesOfSystem().map((planet) => generatedKitOf(SEED, 1n, planet)!)
    expect(
      kits.map((kit) => [
        kit.source,
        kit.merchantName,
        kit.merchantVariant,
        kit.familyId,
        kit.premiumOre.speciesId,
        kit.itemId,
      ]),
    ).toEqual([
      ['authored', 'Hearthmoor Assay', 'Assay', null, 'honey-amber-quartzine', 'cache_crate'],
      ['authored', 'Scree Yard', 'Scree Yard', 'rockfall', 'p2-u3', 'scree_plough'],
      ['authored', 'Gasworks', 'Gasworks', 'firedamp', 'green-apatite-quartzine', 'damp_flask'],
      ['authored', 'Lapidary', 'Lapidary', 'spinecrystal', 'rose-quartz-quartzine', 'shard_tongs'],
      ['authored', 'Boilerhouse', 'Boilerhouse', 'steamvent', 'chromite-brassvein', 'vent_vane'],
    ])
  })

  it('keeps the authored kits whatever the world seed', () => {
    expect(generatedKitOf(7, 1n, 3n)).toEqual(generatedKitOf(SEED, 1n, 3n))
  })

  it('gives a first-system planet with no authored merchant no kit, at p = 40 and 1e6 alike', () => {
    expect(generatedKitOf(SEED, 1n, 6n)).toBeNull()
    expect(generatedKitOf(SEED, 1n, 40n)).toBeNull()
    expect(generatedKitOf(SEED, 1n, 1_000_000n)).toBeNull()
  })

  it('draws every planet past the first system its kit from its roster family’s row', () => {
    for (const kit of drawnKitsOf(DRAWN_SYSTEMS)) {
      const roster = rosterPlanetOf(SEED, BigInt(kit.planet.system), BigInt(kit.planet.planet))
      const row = PLANET_KITS.familyKits.rows.find((r) => r.familyId === kit.familyId)
      expect(kit.source).toBe('generated')
      expect(kit.familyId).toBe(roster.slot?.id ?? null)
      if (row !== undefined)
        expect([kit.merchantVariant, kit.itemId]).toEqual([row.merchantVariant, row.itemId])
    }
  })

  it('gives the SS2-B families a premium-only kit under their row’s variant (GD Q2 = (b))', () => {
    const system2 = drawnKitsOf([2n])
    expect(system2.map((kit) => kit.familyId).sort()).toEqual([
      'brine_leech',
      'cinder_salt',
      'ferro_sand_sink',
      'spall_glass',
      'vent_flare',
    ])
    expect(system2.every((kit) => kit.itemId === null)).toBe(true)
  })

  it('gives a planet with no new family a variant by seed and no item', () => {
    const later = drawnKitsOf([3n, 40n, 1_000_000n])
    expect(later.every((kit) => kit.familyId === null && kit.itemId === null)).toBe(true)
    expect(later.every((kit) => VARIANTS.includes(kit.merchantVariant))).toBe(true)
  })

  it('mints no stats id: a drawn item is an authored one and P40 stays at 69 unlocks (blast_rock, ticket 900)', () => {
    const drawnItems = drawnKitsOf(DRAWN_SYSTEMS).flatMap((kit) => kit.itemId ?? [])
    expect(drawnItems.every((id) => AUTHORED_ITEM_IDS.includes(id))).toBe(true)
    expect(unlockCountThrough(LOCKED_SCHEDULE, 40)).toBe(69)
  })

  it('reads the same kits in any visit order, byte for byte', () => {
    const forward = drawnKitsOf(DRAWN_SYSTEMS)
    const backward = drawnKitsReadBackwards(DRAWN_SYSTEMS)
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward))
    const lone = generatedKitOf(SEED, 40n, 4n)
    expect(JSON.stringify(lone)).toBe(JSON.stringify(forward.find((kit) => isAt(kit, '40', '4'))))
  })

  it('names every generated merchant within three words and 24 characters', () => {
    for (const kit of drawnKitsOf(DRAWN_SYSTEMS)) {
      expect(wordCountOf(kit.merchantName)).toBeLessThanOrEqual(TITLE_WORDS_MAX)
      expect(kit.merchantName.length).toBeLessThanOrEqual(NAME_CHARACTERS_MAX)
      expect(kit.merchantName.endsWith(kit.merchantVariant)).toBe(true)
    }
  })

  it('names a merchant <planet> <variant>, or The <variant> past the word or character budget', () => {
    expect(generatedMerchantNameOf('Kiln', 'Scree Yard')).toBe('Kiln Scree Yard')
    expect(generatedMerchantNameOf('Ember Vault 196', 'Assay')).toBe('Ember Vault 196 Assay')
    expect(generatedMerchantNameOf('Ember Vault 196', 'Scree Yard')).toBe('The Scree Yard')
    expect(generatedMerchantNameOf('Verdigrisholm', 'Boilerhouse')).toBe('The Boilerhouse')
  })

  it('pays the premium on a common or mid kind of the planet’s own pool lying in band 1', () => {
    for (const kit of drawnKitsOf(DRAWN_SYSTEMS)) {
      const pool = planetMaterialPoolOf(SEED, BigInt(kit.planet.system), BigInt(kit.planet.planet))
      const kind = pool.kinds.find((candidate) => candidate.id === kit.premiumOre.speciesId)!
      expect(['common', 'uncommon']).toContain(kind.rarity)
      expect(kind.window[0]).toBeLessThanOrEqual(1)
      expect(kit.premiumOre.epithet).toBe(kind.epithet)
    }
  })

  it('pays the authored premium of planets 1 to 5 on a species lying in band 1', () => {
    for (const planet of placesOfSystem()) {
      const kit = generatedKitOf(SEED, 1n, planet)!
      const species = MATERIALS.materials.find((row) => row.id === kit.premiumOre.speciesId)!
      expect(species.gradeBand[0]).toBeLessThanOrEqual(1)
    }
  })

  it('falls back to the shallowest kind of the pool when no kind meets the rule', () => {
    const kits = kitsWithRule({ id: 'unreachable', rarities: ['uncommon'], reachBand: 0 })
    const kit = generatedKitOf(SEED, 2n, 3n, kits)!
    const pool = planetMaterialPoolOf(SEED, 2n, 3n)
    expect(kit.premiumOre.speciesId).toBe(pool.kinds[0].id)
    expect(pool.kinds[0].window[0]).toBe(Math.min(...pool.kinds.map((kind) => kind.window[0])))
  })
})

function isAt(kit: PlanetKit, system: string, planet: string): boolean {
  return kit.planet.system === system && kit.planet.planet === planet
}
