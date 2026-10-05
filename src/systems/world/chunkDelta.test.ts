import { describe, expect, it } from 'vitest'
import {
  applyChunkDelta,
  decodeDensity,
  EMPTY_CHUNK_DELTA,
  encodeDensityChange,
  isCellYielded,
  isChunkTouched,
  materialCellsOf,
  withCellOverride,
  withCellsYielded,
  withDensity,
} from './chunkDelta'
import { chunkDigest } from './chunkDigest'
import { generateChunk } from './generateChunk'
import { planetParamsFor } from './planetParams'
import { CHUNK_SAMPLES } from './sampleGrid'
import { AIR_CELL, GROUND_CELL, oreCell, RESOURCE_FAMILY } from './worldCell'

const generated = generateChunk(planetParamsFor(83921, 1), 2, 5)

function tunnelThrough(density: Uint8Array): Uint8Array {
  const dug = density.slice()
  dug.fill(0, 128 * 40, 128 * 48)
  dug[5000] = 77
  return dug
}

describe('chunk delta (#36 Storage)', () => {
  it('leaves the generated chunk unchanged when empty', () => {
    expect(applyChunkDelta(generated.cells, EMPTY_CHUNK_DELTA)).toEqual(generated.cells)
    expect(decodeDensity(generated.density, EMPTY_CHUNK_DELTA)).toEqual(generated.density)
    expect(isChunkTouched(EMPTY_CHUNK_DELTA)).toBe(false)
  })

  it('round-trips a carved density through its XOR runs', () => {
    const dug = tunnelThrough(generated.density)
    const delta = withDensity(EMPTY_CHUNK_DELTA, dug, generated.density)
    expect(decodeDensity(generated.density, delta)).toEqual(dug)
    expect(isChunkTouched(delta)).toBe(true)
    expect(delta.version).toBe(1)
  })

  it('stores a tunnel through a cave chunk in a few hundred numbers, an unchanged one in none', () => {
    const runs = encodeDensityChange(tunnelThrough(generated.density), generated.density)
    expect(runs.length).toBeLessThan(300)
    expect(runs.filter((_, at) => at % 2 === 0).reduce((sum, count) => sum + count, 0)).toBe(
      CHUNK_SAMPLES,
    )
    expect(encodeDensityChange(generated.density, generated.density)).toEqual([])
  })

  it('opens a yielded cell for the cell rules but keeps its material', () => {
    const delta = withCellsYielded(EMPTY_CHUNK_DELTA, [33])
    expect(isCellYielded(delta, 33)).toBe(true)
    expect(isCellYielded(delta, 34)).toBe(false)
    expect(applyChunkDelta(generated.cells, delta)[33]).toBe(AIR_CELL)
    expect(materialCellsOf(generated.cells, delta)[33]).toBe(generated.cells[33])
  })

  it('replaces a cell material with an override, keeping overrides sorted', () => {
    const ore = oreCell(RESOURCE_FAMILY.metal, 2)
    const delta = withCellOverride(withCellOverride(EMPTY_CHUNK_DELTA, 9, ore), 3, GROUND_CELL)
    expect(delta.overrides).toEqual([
      [3, GROUND_CELL],
      [9, ore],
    ])
    expect(materialCellsOf(generated.cells, delta)[9]).toBe(ore)
  })

  it('changes the chunk digest when the density changes', () => {
    const dug = { cells: generated.cells, density: tunnelThrough(generated.density) }
    expect(chunkDigest(dug)).not.toBe(chunkDigest(generated))
    expect(chunkDigest(generated)).toMatch(/^[0-9a-f]{16}$/)
  })
})
