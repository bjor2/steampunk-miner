import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition, SliceRegistrar } from '../../registries/sliceDefinition'
import { PARAMS, surfaceOreTiles } from '../authority/scriptedSession'
import type { GenerationHook } from '../registries/generationHooks'
import { subSeedForHook } from '../registries/hookSeed'
import { chunkDigest } from './chunkDigest'
import { generateChunk } from './generateChunk'
import { cellIndexOfTile, chunkOfTile } from './tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  GROUND_CELL,
  kindOfCell,
  oreCell,
  RESOURCE_FAMILY,
  tierOffsetOfCell,
} from './worldCell'

// Generation folds the slices' hooks over the lattice and the painted chunk (feature-slices.md
// 3.8); fake slices register them through withRegistrations, so no real slice is imported.

const [ORE_TILE] = surfaceOreTiles(1)
const CX = chunkOfTile(ORE_TILE.tx)
const CY = chunkOfTile(ORE_TILE.ty)

function hookSliceOf(hook: GenerationHook): SliceDefinition {
  return { id: 'hook-probe', register: (r: SliceRegistrar) => r.generationHook(hook) }
}

function chunkWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => generateChunk(PARAMS, CX, CY))
}

const oreCellOf = (slices: readonly SliceDefinition[]) =>
  chunkWith(slices).cells[cellIndexOfTile(ORE_TILE.tx, ORE_TILE.ty)]

describe('generation hooks at generateChunk', () => {
  it('generates the same chunk when a registered hook has no fold', () => {
    const idle = hookSliceOf({ id: 'hook-probe.idle' })
    expect(chunkDigest(chunkWith([idle]))).toBe(chunkDigest(chunkWith([])))
  })

  it("changes the chunk's digest when a paint hook paints over its ore", () => {
    const paint = hookSliceOf({
      id: 'hook-probe.paint',
      paint: (_params, cells) =>
        cells.forEach((cell, index) => {
          if (kindOfCell(cell) === CELL_KIND.ore) cells[index] = GROUND_CELL
        }),
    })
    expect(kindOfCell(oreCellOf([paint]))).toBe(CELL_KIND.ground)
    expect(chunkDigest(chunkWith([paint]))).not.toBe(chunkDigest(chunkWith([])))
  })

  it("paints each patch with the content a patchContent hook folds the lattice's roll into", () => {
    const crystal = hookSliceOf({
      id: 'hook-probe.crystal',
      patchContent: (_params, _patch, content) => ({ ...content, family: RESOURCE_FAMILY.crystal }),
    })
    expect(familyOfCell(oreCellOf([crystal]))).toBe(RESOURCE_FAMILY.crystal)
    expect(tierOffsetOfCell(oreCellOf([crystal]))).toBe(tierOffsetOfCell(oreCellOf([])))
  })

  it('folds every painted ore cell through an oreCell hook, seeded by the hook id', () => {
    const seeds: number[] = []
    const topTier = hookSliceOf({
      id: 'hook-probe.top-tier',
      oreCell: (_params, _tile, cell, seed) => {
        seeds.push(seed)
        return oreCell(familyOfCell(cell), 4)
      },
    })
    expect(tierOffsetOfCell(oreCellOf([topTier]))).toBe(4)
    expect(new Set(seeds)).toEqual(new Set([subSeedForHook(PARAMS, 'hook-probe.top-tier')]))
  })
})
