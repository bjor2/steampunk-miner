import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { subSeedForHook } from '../../../systems/registries/hookSeed'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import type { OrePatch } from '../../../systems/world/orePatches'
import {
  DEEP_RARE_WINDOW_ORE_RULES,
  ORE_RULES_VERSION,
  planetParamsFor,
  type PlanetParams,
} from '../../../systems/world/planetParams'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk } from '../../../systems/world/tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  kindOfCell,
  tierOffsetOfCell,
} from '../../../systems/world/worldCell'
import { leadWeights } from './oreCatalogue'
import { rarityLeadBucketsBpOf, rarityRowSetOfPlanet, topLeadOf } from './rarityLeads'
import type { RarityRowSet } from './rarityRows'
import { leadOfCell, leadOfPatch, leadOfRoll, ORE_LEAD_HOOK_ID, oreLeadHook } from './leadRoll'

const BANDS = [1, 2, 3, 4, 5]
const PACING_SEED = 83921

const leadSlice: SliceDefinition = { id: 'ores', register: (r) => r.generationHook(oreLeadHook) }

function patchAt(band: number, tx: number, ty: number): OrePatch {
  return { band, centre: { tx, ty }, family: 1, tiles: [] }
}

/** Lead shares of a band over a grid of patch centres, in basis points. */
function leadSharesBp(seed: number, band: number): [number, number] {
  const counts = [0, 0, 0]
  for (let tx = -150; tx < 150; tx++)
    for (let ty = -150; ty < 150; ty++) counts[leadOfPatch(seed, patchAt(band, tx, ty), 'legacy')]++
  const total = counts[0] + counts[1] + counts[2]
  return [(counts[1] * 10000) / total, (counts[2] * 10000) / total]
}

/** Every tile of chunk `(cx, cy)` with its cell, with and without the lead hook. */
function chunkWithAndWithoutLeads(params: PlanetParams, cx: number, cy: number) {
  const plain = withRegistrations([], () => generateChunkCells(params, cx, cy))
  const leaded = withRegistrations([leadSlice], () => generateChunkCells(params, cx, cy))
  return Array.from(plain, (cell, index) => ({
    tile: {
      tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
      ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
    },
    plain: cell,
    leaded: leaded[index],
  }))
}

/** The chunks down the planet's middle column, surface to core. */
function columnChunks(params: PlanetParams): number[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  return Array.from({ length: max - min + 1 }, (_, at) => min + at)
}

/** Lead shares 0 to +4 of a band over a grid of patch centres on the rows, in basis points. */
function rarityLeadSharesBp(seed: number, band: number, set: RarityRowSet): number[] {
  const counts = [0, 0, 0, 0, 0]
  for (let tx = -150; tx < 150; tx++)
    for (let ty = -150; ty < 150; ty++) counts[leadOfPatch(seed, patchAt(band, tx, ty), set)]++
  return counts.map((count) => (count * 10000) / (300 * 300))
}

/** The largest lead any ore cell of the column through the centre holds, under the lead hook. */
function topLeadOfColumn(params: PlanetParams): number {
  const tiles = columnChunks(params).flatMap((cy) => chunkWithAndWithoutLeads(params, 0, cy))
  const ore = tiles.filter(({ plain }) => kindOfCell(plain) === CELL_KIND.ore)
  return Math.max(...ore.map(({ tile, leaded }) => leadOfCell(params, tile, leaded)))
}

describe('ore rarity lead', () => {
  it('rolls +2 below plus2, +1 below plus2 + plus1, else 0', () => {
    expect([0, 149, 150, 599, 600, 9999].map((roll) => leadOfRoll('legacy', 5, roll))).toEqual([
      2, 2, 1, 1, 0, 0,
    ])
    expect([0, 249, 250].map((roll) => leadOfRoll('legacy', 1, roll))).toEqual([1, 1, 0])
  })

  it.each(BANDS)('rolls band %i leads at its weights within 0.2 pp over 90,000 patches', (band) => {
    const seed = subSeedForHook(planetParamsFor(PACING_SEED, 3), ORE_LEAD_HOOK_ID)
    const [plus1, plus2] = leadSharesBp(seed, band)
    const { plus1Bp, plus2Bp } = leadWeights(band)
    expect(Math.abs(plus1 - plus1Bp)).toBeLessThan(20)
    expect(Math.abs(plus2 - plus2Bp)).toBeLessThan(20)
  })

  it('rolls one lead per patch from its band and centre alone', () => {
    const patch = patchAt(4, 17, -230)
    const same = { ...patch, family: 2, tiles: [{ tx: 17, ty: -230 }] } as OrePatch
    expect(leadOfPatch(1234, same, 'mixed')).toBe(leadOfPatch(1234, patch, 'mixed'))
  })

  it('adds the lead to the tier offset the fold hands it and keeps the family', () => {
    const content = { family: 2 as const, tierOffset: 4 }
    const patches = Array.from({ length: 200 }, (_, at) => patchAt(5, at, 9))
    const folded = patches.map((patch) =>
      oreLeadHook.patchContent!(planetParamsFor(1, 1), patch, content, 77),
    )
    expect(new Set(folded.map((each) => each.family))).toEqual(new Set([2]))
    expect(new Set(folded.map((each) => each.tierOffset))).toEqual(new Set([4, 5, 6]))
  })

  it('raises generated ore by its lead and moves no other cell', () => {
    const params = planetParamsFor(PACING_SEED, 3)
    const tiles = columnChunks(params).flatMap((cy) => chunkWithAndWithoutLeads(params, 0, cy))
    const ore = tiles.filter(({ plain }) => kindOfCell(plain) === CELL_KIND.ore)
    const leads = ore.map(({ tile, leaded }) => leadOfCell(params, tile, leaded))
    expect(
      tiles
        .filter(({ plain }) => kindOfCell(plain) !== CELL_KIND.ore)
        .every(({ plain, leaded }) => plain === leaded),
    ).toBe(true)
    ore.forEach(({ tile, plain, leaded }, at) => {
      expect(familyOfCell(leaded)).toBe(familyOfCell(plain))
      expect(tierOffsetOfCell(leaded)).toBe(tierOffsetOfCell(plain) + leads[at])
      expect(tierOffsetOfCell(plain)).toBe(bandOfTile(params, tile.tx, tile.ty) - 1)
    })
    expect(leads.every((lead) => lead >= 0 && lead <= 2)).toBe(true)
    expect(new Set(leads).size).toBeGreaterThan(1)
  })

  it('reads no lead off a cell the hook never touched', () => {
    const params = planetParamsFor(PACING_SEED, 3)
    const tiles = columnChunks(params).flatMap((cy) => chunkWithAndWithoutLeads(params, 0, cy))
    expect(tiles.every(({ tile, plain }) => leadOfCell(params, tile, plain) === 0)).toBe(true)
  })
})

describe('ore rarity lead on the rarity rows (ticket 445)', () => {
  it('rolls the legacy rows exactly as the lead weights, roll by roll, in every band', () => {
    for (const band of BANDS) {
      const { plus1Bp, plus2Bp } = leadWeights(band)
      const today = (roll: number) => (roll < plus2Bp ? 2 : roll < plus2Bp + plus1Bp ? 1 : 0)
      const rolls = Array.from({ length: 10000 }, (_, roll) => roll)
      expect(rolls.map((roll) => leadOfRoll('legacy', band, roll))).toEqual(rolls.map(today))
    }
  })

  it('rolls mythic, epic, rare and uncommon from the lowest rolls up on the mixed rows', () => {
    // Band 5: mythic 19, epic 43, rare 97, uncommon 224 bp (Systems, comment 6202970624).
    expect(
      [0, 18, 19, 61, 62, 158, 159, 382, 383, 9999].map((roll) => leadOfRoll('mixed', 5, roll)),
    ).toEqual([4, 4, 3, 3, 2, 2, 1, 1, 0, 0])
  })

  it.each(BANDS)('rolls band %i at its mixed weights within 0.2 pp over 90,000 patches', (band) => {
    const seed = subSeedForHook(
      planetParamsFor(PACING_SEED, 3, ORE_RULES_VERSION),
      ORE_LEAD_HOOK_ID,
    )
    const shares = rarityLeadSharesBp(seed, band, 'mixed')
    const weights = rarityLeadBucketsBpOf('mixed', band)
    shares.forEach((share, lead) => expect(Math.abs(share - weights[lead])).toBeLessThan(20))
  })

  it('rolls the mixed rows on a planet entered from P3 under ore rules 10, the deep rows from 11', () => {
    const before = DEEP_RARE_WINDOW_ORE_RULES - 1
    expect(rarityRowSetOfPlanet(planetParamsFor(PACING_SEED, 3, before))).toBe('mixed')
    expect(rarityRowSetOfPlanet(planetParamsFor(PACING_SEED, 3, ORE_RULES_VERSION))).toBe('deep')
    expect(rarityRowSetOfPlanet(planetParamsFor(PACING_SEED, 3))).toBe('legacy')
    expect(rarityRowSetOfPlanet(planetParamsFor(PACING_SEED, 2, ORE_RULES_VERSION))).toBe('legacy')
  })

  it('rolls no rare, epic or mythic in bands 1 and 2 on the deep rows (ticket 738)', () => {
    const rolls = Array.from({ length: 10000 }, (_, roll) => roll)
    for (const band of [1, 2])
      expect(Math.max(...rolls.map((roll) => leadOfRoll('deep', band, roll)))).toBe(1)
    expect(leadOfRoll('deep', 3, 0)).toBe(3)
  })

  it('never lifts ore past +2 on a legacy planet, nor past +4 on a stamped one', () => {
    expect(topLeadOfColumn(planetParamsFor(PACING_SEED, 12))).toBeLessThanOrEqual(2)
    expect(
      topLeadOfColumn(planetParamsFor(PACING_SEED, 12, ORE_RULES_VERSION)),
    ).toBeLessThanOrEqual(4)
  })

  it('draws +2 at most on the legacy rows and +4 on the mixed and deep rows', () => {
    expect(topLeadOf('legacy')).toBe(2)
    expect(topLeadOf('mixed')).toBe(4)
    expect(topLeadOf('deep')).toBe(4)
  })
})
