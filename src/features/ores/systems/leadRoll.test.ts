import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { subSeedForHook } from '../../../systems/registries/hookSeed'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import type { OrePatch } from '../../../systems/world/orePatches'
import { planetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk } from '../../../systems/world/tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  kindOfCell,
  tierOffsetOfCell,
} from '../../../systems/world/worldCell'
import { leadWeights } from './oreCatalogue'
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
    for (let ty = -150; ty < 150; ty++) counts[leadOfPatch(seed, patchAt(band, tx, ty))]++
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

describe('ore rarity lead', () => {
  it('rolls +2 below plus2, +1 below plus2 + plus1, else 0', () => {
    expect([0, 149, 150, 599, 600, 9999].map((roll) => leadOfRoll(5, roll))).toEqual([
      2, 2, 1, 1, 0, 0,
    ])
    expect([0, 249, 250].map((roll) => leadOfRoll(1, roll))).toEqual([1, 1, 0])
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
    expect(leadOfPatch(1234, same)).toBe(leadOfPatch(1234, patch))
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
