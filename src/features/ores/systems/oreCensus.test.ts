import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import { planetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { leadOfCell, oreLeadHook } from './leadRoll'
import { chunksOfPlanet, oreCensusOf, type ChunkPoint } from './oreCensus'
import { oreTypeProvider } from './oreTypeProvider'

const PACING_SEED = 83921

const oresSlice: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes(oreTypeProvider)
    r.generationHook(oreLeadHook)
  },
}

/** The catalogue with every ore marked a signature, standing in for #147's signature cells. */
const signatureSlice: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes({
      ...oreTypeProvider,
      oreTypeOf: (query) => ({ ...oreTypeProvider.oreTypeOf(query), signature: true }),
    })
    r.generationHook(oreLeadHook)
  },
}

const neverGated = () => false
const alwaysGated = () => true

/** The chunks down the planet's middle column, surface to core. */
function columnChunks(params: PlanetParams): ChunkPoint[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  return Array.from({ length: max - min + 1 }, (_, at) => ({ cx: 0, cy: min + at }))
}

/** Lead cells of the chunks by lead, counted tile by tile. */
function leadCellsOf(params: PlanetParams, chunks: readonly ChunkPoint[]): number[] {
  const counts = [0, 0, 0]
  for (const { cx, cy } of chunks) {
    const cells = generateChunkCells(params, cx, cy)
    cells.forEach((cell, index) => {
      if (kindOfCell(cell) !== CELL_KIND.ore) return
      const tile = {
        tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
        ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
      }
      counts[leadOfCell(params, tile, cell)]++
    })
  }
  return counts
}

describe('ore census', () => {
  const params = planetParamsFor(PACING_SEED, 3)
  const chunks = columnChunks(params)

  it('counts the lead cells of the chunks by their lead', () => {
    const [common, plus1, plus2] = withRegistrations([oresSlice], () => leadCellsOf(params, chunks))
    const census = withRegistrations([oresSlice], () => oreCensusOf(params, chunks, neverGated))
    expect(census).toMatchObject({ oreCells: common + plus1 + plus2, plus1Cells: plus1 })
    expect(census.plus2Cells).toBe(plus2)
    expect(plus1 + plus2).toBeGreaterThan(0)
  })

  it('counts a lead cell as gated only where a gate holds it, and never a common cell', () => {
    const held = withRegistrations([oresSlice], () => oreCensusOf(params, chunks, alwaysGated))
    const open = withRegistrations([oresSlice], () => oreCensusOf(params, chunks, neverGated))
    expect(held.gatedLeadCells).toBe(held.plus1Cells + held.plus2Cells)
    expect(open.gatedLeadCells).toBe(0)
  })

  it('counts the cells whose catalogue ore is a signature', () => {
    const marked = withRegistrations([signatureSlice], () =>
      oreCensusOf(params, chunks, neverGated),
    )
    const plain = withRegistrations([oresSlice], () => oreCensusOf(params, chunks, neverGated))
    expect(marked.signatureCells).toBe(marked.oreCells)
    expect(plain.signatureCells).toBe(0)
  })

  it("lists every chunk of the planet's disc once", () => {
    const all = chunksOfPlanet(params)
    const { min, max } = chunkRangeOfDisc(params.radiusTiles)
    expect(all).toHaveLength((max - min + 1) ** 2)
    expect(new Set(all.map(({ cx, cy }) => `${cx},${cy}`)).size).toBe(all.length)
  })
})
