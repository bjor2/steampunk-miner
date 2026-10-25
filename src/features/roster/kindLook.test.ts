import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { readAuthorityState } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { kindLookProvider } from '../../systems/registries/kindLook'
import { lumaOf } from '../../systems/render/colour'
import {
  GEM_GLINT_FLAG,
  gemGlintCodeOfEntry,
  HERO_LOOK_FLAG,
  KIND_LOOK_SLOTS,
  kindEntryOf,
  kindLookTableOf,
  LOOK_VECTOR,
  NO_SEEN_LEAD,
  rarityLeadOfEntry,
  rgbOfPacked,
  type KindLook,
} from '../../systems/render/kindLookTable'
import { bandOfTile } from '../../systems/world/planetGeometry'
import {
  freshPlanetParamsFor,
  GENERATED_POOLS_FIRST_PLANET,
  GENERATED_POOLS_ORE_RULES,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { chunkRangeOfDisc, CHUNK_SIZE, firstTileOfChunk } from '../../systems/world/tileGrid'
import {
  CELL_KIND,
  kindOfCell,
  kindSlotOfCell,
  NO_KIND_SLOT,
  tierOffsetOfCell,
} from '../../systems/world/worldCell'
import { generateChunk } from '../../systems/world/generateChunk'
import { MATERIAL_RARITIES, MATERIALS } from '../materials'
import { ORE_ROWS, rarityTiers } from '../ores'
import { NAMED_SEEDS } from './rosterFixtures'
import { renderStateDigestOf } from './renderStateFixtures'
import { planetRosterOf, ROSTER_ORE_RULES } from './systems/planetRoster'
import { gemSaleTierOfKind } from './systems/rosterGems'
import { actOf } from '../planet-mix'
import {
  heroAtlasOfPlanet,
  planetKindLooksOf,
  rarityLooksByLead,
  ROSTER_KIND_LOOK,
} from './systems/render/kindLookProvider'

// Ticket 450's acceptance on the roster's look provider (TD shape 6226270701, the Scalers'
// conditions on #450): unseen kinds draw the family look, kinds of one family read apart, the
// rarity look rises with the tier offset, a species looks the same on every band and planet, and
// a planet with no roster draws exactly what main drew.

const [SEED, SECOND_SEED] = NAMED_SEEDS

/** Every planet a species pool covers, P1 and P2 legacy, P3 to P7 the mixed pools (#453). */
const POOLED_PLANETS = [...ORE_ROWS.kinds.poolByPlanet.keys()]

/** The ore rules that swap three of P2's species (ticket 736): a P2 entered before shows the old three. */
const P2_SWAP_ORE_RULES = 9

/**
 * Every pooled planet as its authored pool shows it, fresh to P5 and P6 and P7 from before their
 * generated pools (ticket 888), and P2 entered before its swap, so every species row is shown once.
 */
function everyShownPlanetOf(seed: number): PlanetParams[] {
  return [
    ...POOLED_PLANETS.map((planetIndex) => authoredParamsOf(seed, planetIndex)),
    planetParamsFor(seed, 2, P2_SWAP_ORE_RULES - 1),
  ]
}

function authoredParamsOf(seed: number, planetIndex: number): PlanetParams {
  return planetIndex >= GENERATED_POOLS_FIRST_PLANET
    ? planetParamsFor(seed, planetIndex, GENERATED_POOLS_ORE_RULES - 1)
    : freshPlanetParamsFor(seed, planetIndex)
}

/** Fresh planets that draw their generated pools (ticket 888): system 1's P6, P8 and P40. */
function generatedPlanetsOf(seed: number): PlanetParams[] {
  return [6, 8, 40].map((planetIndex) => freshPlanetParamsFor(seed, planetIndex))
}

/** Main's render-state digests at a157e171, before the kind look (renderStateFixtures.ts). */
const MAIN_DRAWN_DIGESTS: Readonly<Record<string, string>> = {
  [`${SEED} 1`]: '3f8d7d027cca7a60',
  [`${SEED} 2`]: '912ad324518480f6',
  [`${SECOND_SEED} 1`]: 'f0ede6b77c78b468',
  [`${SECOND_SEED} 2`]: '2ee2e1ccd9ac0f5a',
}

/** A slot's entry without its gem glint: the species' skin, rarity and hero cell. */
function skinEntryOf(look: KindLook): number[] {
  const [silhouette, pattern, colour, fourth] = kindEntryOf(look)
  return [silhouette, pattern, colour, fourth % GEM_GLINT_FLAG]
}

function shownLooks(params = freshPlanetParamsFor(SEED, 1)): KindLook[] {
  return planetKindLooksOf(params).filter((look): look is KindLook => look !== null)
}

/** (silhouette code, pattern code, packed colour): what tells two species apart on the ground. */
function lookKeyOf(look: KindLook): number[] {
  return kindEntryOf(look).slice(0, 3)
}

function sharedKeysOf(a: KindLook, b: KindLook): number {
  const [left, right] = [lookKeyOf(a), lookKeyOf(b)]
  return left.filter((value, at) => value === right[at]).length
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

describe('roster kind looks', () => {
  beforeEach(() => resetGameStore())

  it('holds a table slot for every kind a roster may hold', () => {
    expect(KIND_LOOK_SLOTS).toBe(ORE_ROWS.kinds.rosterMaxKinds)
  })

  it('registers as the kind look provider', () => {
    expect(kindLookProvider()?.id).toBe(ROSTER_KIND_LOOK.id)
  })

  it('draws every species of a fresh save in its own skin, with no rarity yet (ticket 698)', () => {
    const state = readAuthorityState()
    const { playerId } = useGameStore.getState()
    const params = freshPlanetParamsFor(SEED, 1)
    const looks = planetKindLooksOf(params)
    const table = kindLookTableOf(looks, rarityLooksByLead(), (look) =>
      ROSTER_KIND_LOOK.hasSeenKind(state, playerId, look.speciesId),
    )
    const drawn = looks.flatMap((look, at) => (look === null ? [] : [at * LOOK_VECTOR]))
    expect(drawn.length).toBeGreaterThan(0)
    expect(table.revealedSlots).toBe(drawn.length)
    expect(drawn.every((at) => table.kinds[at] > 0)).toBe(true)
    expect(new Set(drawn.map((at) => rarityLeadOfEntry(table.kinds[at + 3])))).toEqual(new Set([0]))
    expect(new Set(table.seenLeads)).toEqual(new Set([NO_SEEN_LEAD]))
  })

  it('shows the rarity of a species only once the player has met it', () => {
    const [met, unmet] = shownLooks()
    const state = readAuthorityState()
    const { playerId } = useGameStore.getState()
    withRegistrations([metSlice([met.speciesId])], () => {
      expect(ROSTER_KIND_LOOK.hasSeenKind(state, playerId, met.speciesId)).toBe(true)
      expect(ROSTER_KIND_LOOK.hasSeenKind(state, playerId, unmet.speciesId)).toBe(false)
    })
  })

  it.each(POOLED_PLANETS)(
    'tells every two kinds of one family apart in at least two of silhouette, pattern and hue (planet %i)',
    (planetIndex) => {
      const looks = shownLooks(freshPlanetParamsFor(SEED, planetIndex))
      const species = MATERIALS.materials
      const familyOf = (look: KindLook) => species.find((row) => row.id === look.speciesId)?.family
      const pairs = looks.flatMap((a, at) =>
        looks
          .slice(at + 1)
          .filter((b) => b.speciesId !== a.speciesId && familyOf(a) === familyOf(b))
          .map((b) => [a, b]),
      )
      expect(pairs.length).toBeGreaterThan(0)
      for (const [a, b] of pairs)
        expect(sharedKeysOf(a, b), `${a.speciesId} ${b.speciesId}`).toBeLessThanOrEqual(1)
    },
  )

  // The gem glint (ticket 786) is left off: it follows the planet's price table, so a species sold
  // as a gem under one ore rules version glints there alone (the next spec).
  it('keeps one skin per species across bands and planets', () => {
    const entriesById = new Map<string, number[][]>()
    for (const seed of [SEED, SECOND_SEED]) {
      for (const params of everyShownPlanetOf(seed)) {
        for (const look of shownLooks(params)) {
          entriesById.set(look.speciesId, [
            ...(entriesById.get(look.speciesId) ?? []),
            skinEntryOf(look),
          ])
        }
      }
    }
    expect(entriesById.size).toBe(MATERIALS.materials.length)
    for (const [id, [first, ...rest]] of entriesById) {
      for (const entry of rest) expect(entry, id).toEqual(first)
    }
  })

  it('glints exactly the kinds the price table sells as gems of their planet (ticket 786)', () => {
    for (const params of [...everyShownPlanetOf(SEED), ...generatedPlanetsOf(SEED)]) {
      const roster = planetRosterOf(params)
      planetKindLooksOf(params).forEach((look, at) => {
        if (look === null) return
        const isGem = gemSaleTierOfKind(params, roster[at]) !== null
        expect(gemGlintCodeOfEntry(kindEntryOf(look)[3]) > 0, look.speciesId).toBe(isGem)
      })
    }
  })

  it('draws the rarity a cell shows from its tier offset over its band', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    const looks = planetKindLooksOf(params)
    const { min, max } = chunkRangeOfDisc(params.radiusTiles)
    let checked = 0
    for (let cy = max; cy >= min; cy--) {
      const chunk = generateChunk(params, 0, cy)
      chunk.cells.forEach((cell, at) => {
        if (kindOfCell(cell) !== CELL_KIND.ore || kindSlotOfCell(cell) === NO_KIND_SLOT) return
        const look = looks[kindSlotOfCell(cell) - 1]
        if (look === null) return
        const tx = firstTileOfChunk(0) + (at % CHUNK_SIZE)
        const ty = firstTileOfChunk(cy) + Math.floor(at / CHUNK_SIZE)
        expect(look.rarityLead).toBe(tierOffsetOfCell(cell) - (bandOfTile(params, tx, ty) - 1))
        checked++
      })
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('names the rarity tier of each lead from common to mythic, and none past them (ticket 454)', () => {
    expect([0, 1, 2, 3, 4, 5, -1].map(ROSTER_KIND_LOOK.rarityIdOfLead)).toEqual([
      ...MATERIAL_RARITIES,
      null,
      null,
    ])
  })

  it('draws a wider frame, a brighter tint and no less glow for each rarity up', () => {
    const table = kindLookTableOf([], rarityLooksByLead(), () => true)
    const leads = Array.from({ length: table.rarity.length / LOOK_VECTOR }, (_, at) =>
      Array.from(table.rarity.subarray(at * LOOK_VECTOR, (at + 1) * LOOK_VECTOR)),
    )
    for (let at = 1; at < leads.length; at++) {
      const [tint, glow, frame, pulse] = leads[at]
      const [lowerTint, lowerGlow, lowerFrame, lowerPulse] = leads[at - 1]
      expect(frame).toBeGreaterThan(lowerFrame)
      expect(lumaOf(rgbOfPacked(tint))).toBeGreaterThan(lumaOf(rgbOfPacked(lowerTint)))
      expect(glow).toBeGreaterThanOrEqual(lowerGlow)
      expect(pulse).toBeGreaterThanOrEqual(lowerPulse)
    }
  })

  it('draws rarity from the rarity alone, so a family carries no value in its look', () => {
    const looks = [...shownLooks(), ...shownLooks(freshPlanetParamsFor(SEED, 2))]
    const rowOf = (look: KindLook) => MATERIALS.materials.find((row) => row.id === look.speciesId)
    for (const look of looks) {
      const lead = kindEntryOf(look)[3] % HERO_LOOK_FLAG
      expect(lead, look.speciesId).toBe(
        rarityTiers().find((t) => t.id === rowOf(look)?.rarity)?.tierOffset,
      )
    }
    const commonFamilies = new Set(
      looks.filter((look) => look.rarityLead === 0).map((look) => rowOf(look)?.family),
    )
    expect(commonFamilies.size).toBeGreaterThan(1)
  })

  it.each([
    [SEED, 1],
    [SEED, 2],
    [SECOND_SEED, 1],
    [SECOND_SEED, 2],
  ])(
    'draws a planet with no roster exactly as main drew it (seed %i, planet %i)',
    (seed, planet) => {
      const digest = renderStateDigestOf(planetParamsFor(seed, planet))
      expect(digest.drawn).toBe(MAIN_DRAWN_DIGESTS[`${seed} ${planet}`])
      expect(digest.kindSlots).toEqual([NO_KIND_SLOT])
    },
  )

  it('keeps every array main drew on a roster planet and adds only the kind slots', () => {
    // The roster's own rules: a fresh planet 1 also grows its rare ore in clusters (ticket 737).
    const digest = renderStateDigestOf(planetParamsFor(SEED, 1, ROSTER_ORE_RULES))
    expect(digest.drawn).toBe(MAIN_DRAWN_DIGESTS[`${SEED} 1`])
    expect(digest.kindSlots.some((slot) => slot !== NO_KIND_SLOT)).toBe(true)
  })
})

describe('roster hero atlases (ticket 451)', () => {
  it("hands P1 its act's atlas, and P2 to P7 one shared atlas object", () => {
    expect(heroAtlasOfPlanet(1)?.id).toBe('foothold.base')
    const heavy = heroAtlasOfPlanet(2)
    expect(heavy?.id).toBe('foothold.heavy')
    expect([3, 4, 5, 6, 7].every((planet) => heroAtlasOfPlanet(planet) === heavy)).toBe(true)
  })

  it('hands an act with no hero art no atlas, so its heroes draw the shader look', () => {
    expect(actOf(8).id).toBe('fire')
    expect(heroAtlasOfPlanet(8)).toBe(null)
  })

  // P2's own pool (ticket 632) has hero art for its three gems (ticket 744), so a fresh P2 shows
  // three; a P2 a save holds under ore rules 5 keeps the legacy heroes its atlas packs; a fresh P1
  // shows the legacy four and its three gems (ticket 785). P3 to P5 show their three gems and the
  // five other heroes of their pools, the latter on the act's page 2 (ticket 853).
  it("gives every hero of the P1 to P5 rosters a cell of its planet's atlas", () => {
    const rosters = [
      { params: freshPlanetParamsFor(SEED, 1), heroCount: 7 },
      { params: planetParamsFor(SEED, 2, 5), heroCount: 4 },
      { params: freshPlanetParamsFor(SEED, 2), heroCount: 3 },
      { params: freshPlanetParamsFor(SEED, 3), heroCount: 8 },
      { params: freshPlanetParamsFor(SEED, 4), heroCount: 8 },
      { params: freshPlanetParamsFor(SEED, 5), heroCount: 8 },
    ]
    for (const { params, heroCount } of rosters) {
      const cells = heroAtlasOfPlanet(params.planetIndex)?.pages.flatMap((page) => page.cells) ?? []
      const heroes = shownLooks(params).filter((look) => look.isHero)
      expect(heroes.length, `planet ${params.planetIndex}`).toBe(heroCount)
      expect(heroes.filter((look) => !cells.includes(look.speciesId))).toEqual([])
    }
  })

  it('names the atlases through the registered look provider', () => {
    expect(kindLookProvider()?.heroAtlasOf(1)).toBe(ROSTER_KIND_LOOK.heroAtlasOf(1))
  })
})
