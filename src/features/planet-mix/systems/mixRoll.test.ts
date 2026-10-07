import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
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
import { familyOfCellCode, oreLeadHook, oreTierOf } from '../../ores'
import { familyOfPatch, planetMixHookOf } from './mixRoll'
import { leadBucketsBpOf, mixSeedOf, oreMixOf } from './oreMix'
import { planetMixPlanOf } from './planetActs'

const PACING_SEED = 83921

const leadSlice: SliceDefinition = { id: 'ores', register: (r) => r.generationHook(oreLeadHook) }
const mixSlice: SliceDefinition = {
  id: 'planet-mix',
  register: (r) => r.generationHook(planetMixHookOf(() => false)),
}

/** The cells of the chunks down the planet's middle column, under the given slices. */
function columnCells(params: PlanetParams, slices: readonly SliceDefinition[]) {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const chunks = Array.from({ length: max - min + 1 }, (_, at) => min + at)
  return withRegistrations(slices, () =>
    chunks.flatMap((cy) =>
      Array.from(generateChunkCells(params, 0, cy), (cell, index) => ({
        tile: {
          tx: firstTileOfChunk(0) + (index % CHUNK_SIZE),
          ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
        },
        cell,
      })),
    ),
  )
}

function patchAt(band: number, tx: number, ty: number): OrePatch {
  return { band, centre: { tx, ty }, family: 1, tiles: [] }
}

describe('planet mix fold', () => {
  it('leaves P1 and P2 byte-identical to the lead roll alone', () => {
    for (const planet of [1, 2]) {
      const params = planetParamsFor(PACING_SEED, planet)
      const leadOnly = columnCells(params, [leadSlice]).map(({ cell }) => cell)
      const mixed = columnCells(params, [leadSlice, mixSlice]).map(({ cell }) => cell)
      expect(mixed).toEqual(leadOnly)
    }
  })

  it('changes only ore families on P3, never a tier or another cell', () => {
    const params = planetParamsFor(PACING_SEED, 3)
    const leadOnly = columnCells(params, [leadSlice])
    const mixed = columnCells(params, [leadSlice, mixSlice])
    const moved = mixed.filter(({ cell }, at) => cell !== leadOnly[at].cell)
    expect(moved.length).toBeGreaterThan(0)
    expect(moved.every(({ cell }) => kindOfCell(cell) === CELL_KIND.ore)).toBe(true)
    expect(mixed.map(({ cell }) => tierOffsetOfCell(cell))).toEqual(
      leadOnly.map(({ cell }) => tierOffsetOfCell(cell)),
    )
  })

  it("paints only the mix's types, band by band, on a Fire and a Hollow planet", () => {
    for (const planet of [9, 36]) {
      const params = planetParamsFor(PACING_SEED, planet)
      const mix = oreMixOf(params)
      const ore = columnCells(params, [leadSlice, mixSlice]).filter(
        ({ cell }) => kindOfCell(cell) === CELL_KIND.ore,
      )
      for (const { tile, cell } of ore) {
        const band = bandOfTile(params, tile.tx, tile.ty)
        const family = familyOfCellCode(familyOfCell(cell))?.id
        const tier = oreTierOf(planet, 1, tierOffsetOfCell(cell))
        const allowed = mix.bands[band - 1].map((entry) => `${entry.family}_t${entry.tier}`)
        expect(allowed).toContain(`${family}_t${tier}`)
      }
    }
  })

  it('gives the signature its share of the patches it is carved from, per band', () => {
    const params = planetParamsFor(PACING_SEED, 12)
    const plan = planetMixPlanOf(12, mixSeedOf(params))
    for (const [band, lead] of [
      [4, 1],
      [5, 0],
    ]) {
      let signatures = 0
      let patches = 0
      for (let tx = -100; tx < 100; tx++)
        for (let ty = -100; ty < 100; ty++) {
          patches++
          if (familyOfPatch(plan, patchAt(band, tx, ty), lead, mixSeedOf(params), false).signature)
            signatures++
        }
      const bucketBp = leadBucketsBpOf(band)[lead]
      expect((signatures * bucketBp) / patches).toBeGreaterThan(270)
      expect((signatures * bucketBp) / patches).toBeLessThan(330)
    }
  })

  it('never makes a signature of a lead the signature does not share', () => {
    const params = planetParamsFor(PACING_SEED, 12)
    const plan = planetMixPlanOf(12, mixSeedOf(params))
    for (let tx = 0; tx < 200; tx++) {
      expect(familyOfPatch(plan, patchAt(4, tx, 3), 0, 1, true).signature).toBe(false)
      expect(familyOfPatch(plan, patchAt(5, tx, 3), 1, 1, true).signature).toBe(false)
      expect(familyOfPatch(plan, patchAt(3, tx, 3), 2, 1, true).signature).toBe(false)
    }
  })
})
