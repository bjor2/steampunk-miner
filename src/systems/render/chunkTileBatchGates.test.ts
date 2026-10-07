import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { PARAMS, surfaceOreTiles } from '../authority/scriptedSession'
import type { CellGateLookProvider } from '../registries/cellGateLook'
import { chunkOfTile, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { currentDensityOfChunk, EMPTY_WORLD, materialCellsOfChunk } from '../world/worldState'
import { gateLookOfBits, MAX_GATE_KIND, MAX_GATE_STATE, type CellGateLook } from './cellGateBits'
import { buildChunkTileBatch, SILHOUETTE_CODE, type ChunkTileBatch } from './chunkTileBatch'
import { chunkDensityHaloOf } from './densityHalo'

// The chunk mesh asks the cellGateLook registry which gate a cell shows (feature-slices.md 3.33,
// ticket 298); a fake provider registers through withRegistrations, so no real slice is imported.

const [ORE_TILE] = surfaceOreTiles(1)
const CX = chunkOfTile(ORE_TILE.tx)
const CY = chunkOfTile(ORE_TILE.ty)

/** A provider gating every ore cell with `look`, and noting each tile it was asked about. */
function gateEveryOreSlice(look: CellGateLook, asked: TilePoint[] = []): SliceDefinition {
  const provider: CellGateLookProvider = {
    id: 'gate-probe.every-ore',
    cellGateLookOf: (_params, cell, tile) => {
      asked.push({ tx: tile.tx, ty: tile.ty })
      return kindOfCell(cell) === CELL_KIND.ore ? look : null
    },
    markerTintOf: () => null,
  }
  return { id: 'gate-probe', register: (r) => r.cellGateLook(provider) }
}

function batchWith(slices: readonly SliceDefinition[]): ChunkTileBatch {
  return withRegistrations(slices, () => {
    const cells = materialCellsOfChunk(EMPTY_WORLD, PARAMS, CX, CY)
    const halo = chunkDensityHaloOf(
      (x, y) => currentDensityOfChunk(EMPTY_WORLD, PARAMS, x, y),
      CX,
      CY,
    )
    return buildChunkTileBatch(PARAMS, CX, CY, cells, halo)
  })
}

function isOreTile(batch: ChunkTileBatch, at: number): boolean {
  return batch.styles[at * 4 + 2] !== SILHOUETTE_CODE.none
}

/** The gate look each drawn tile carries, ore tiles and the rest apart. */
function gateLooksOf(batch: ChunkTileBatch): { ore: string[]; rest: string[] } {
  const looks = { ore: [] as string[], rest: [] as string[] }
  for (let at = 0; at < batch.count; at++) {
    const look = JSON.stringify(gateLookOfBits(batch.gates[at]))
    looks[isOreTile(batch, at) ? 'ore' : 'rest'].push(look)
  }
  return looks
}

/** Everything the shader read before the gate channel: tiles, colours, styles, block starts. */
function lookBeforeGatesOf(batch: ChunkTileBatch): number[][] {
  return [batch.tiles, batch.baseColours, batch.oreColours, batch.styles, batch.blockStarts].map(
    (values) => Array.from(values),
  )
}

describe('gate channel at the chunk mesh', () => {
  it.each(Array.from({ length: MAX_GATE_STATE + 1 }, (_, state) => state))(
    'carries the highest gate kind in state %i through the per-cell bits',
    (state) => {
      const look = { kind: MAX_GATE_KIND, state }
      const looks = gateLooksOf(batchWith([gateEveryOreSlice(look)]))
      expect(looks.ore.length).toBeGreaterThan(0)
      expect(new Set(looks.ore)).toEqual(new Set([JSON.stringify(look)]))
      expect(new Set(looks.rest)).toEqual(new Set(['null']))
    },
  )

  it('asks the provider with each tile in planet coordinates', () => {
    const asked: TilePoint[] = []
    batchWith([gateEveryOreSlice({ kind: 0, state: 0 }, asked)])
    expect(asked).toContainEqual(ORE_TILE)
  })

  it('draws terrain exactly as before the channel when no provider is registered', () => {
    const plain = batchWith([])
    const gated = batchWith([gateEveryOreSlice({ kind: MAX_GATE_KIND, state: MAX_GATE_STATE })])
    expect(Array.from(plain.gates.subarray(0, plain.count)).every((bits) => bits === 0)).toBe(true)
    expect(plain.count).toBe(gated.count)
    expect(lookBeforeGatesOf(plain)).toEqual(lookBeforeGatesOf(gated))
  })
})
