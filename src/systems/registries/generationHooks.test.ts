import { describe, expect, it } from 'vitest'
import type { OrePatch } from '../world/orePatches'
import { planetParamsFor } from '../world/planetParams'
import { CHUNK_CELLS } from '../world/tileGrid'
import { oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import {
  foldOreCell,
  foldPatchContent,
  GENERATION_HOOK_REGISTRY,
  paintGenerationHooks,
  type GenerationHook,
} from './generationHooks'
import { subSeedForHook } from './hookSeed'
import { addToRegistry, withFreshRegistrySet } from './seal'

const PARAMS = planetParamsFor(83921, 1)
const PATCH: OrePatch = {
  band: 2,
  centre: { tx: 0, ty: 30 },
  family: RESOURCE_FAMILY.metal,
  tiles: [],
}
const ROLLED = { family: RESOURCE_FAMILY.metal, tierOffset: 1 }
const TILE = { tx: 0, ty: 30 }
const METAL = oreCell(RESOURCE_FAMILY.metal, 1)

function registerHooks(...hooks: GenerationHook[]): () => void {
  return () => hooks.forEach((hook) => addToRegistry(GENERATION_HOOK_REGISTRY, 'ores', hook))
}

describe('generation hooks registry', () => {
  it('leaves patch content, ore cells and painted cells unchanged with no hook', () => {
    const cells = new Uint32Array(CHUNK_CELLS).fill(7)
    const folded = withFreshRegistrySet(registerHooks(), () => {
      paintGenerationHooks(PARAMS, cells, 0, 1)
      return [foldPatchContent(PARAMS, PATCH, ROLLED), foldOreCell(PARAMS, TILE, METAL)]
    })
    expect(folded).toEqual([ROLLED, METAL])
    expect(cells.every((cell) => cell === 7)).toBe(true)
  })

  it('folds patch content through the hooks in id order', () => {
    const content = withFreshRegistrySet(
      registerHooks(
        {
          id: 'ores.b-double',
          patchContent: (_p, _patch, rolled) => ({ ...rolled, tierOffset: rolled.tierOffset * 2 }),
        },
        {
          id: 'ores.a-add',
          patchContent: (_p, _patch, rolled) => ({ ...rolled, tierOffset: rolled.tierOffset + 3 }),
        },
      ),
      () => foldPatchContent(PARAMS, PATCH, ROLLED),
    )
    expect(content.tierOffset).toBe((1 + 3) * 2)
  })

  it('skips a hook that has no fold of that kind', () => {
    const cell = withFreshRegistrySet(
      registerHooks(
        { id: 'ores.paint-only', paint: () => undefined },
        { id: 'ores.crystal', oreCell: () => oreCell(RESOURCE_FAMILY.crystal, 1) },
      ),
      () => foldOreCell(PARAMS, TILE, METAL),
    )
    expect(cell).toBe(oreCell(RESOURCE_FAMILY.crystal, 1))
  })

  it("hands each hook its own id's sub-seed", () => {
    const seeds: number[] = []
    withFreshRegistrySet(
      registerHooks({
        id: 'ores.seeded',
        paint: (_p, _cells, _cx, _cy, seed) => void seeds.push(seed),
      }),
      () => paintGenerationHooks(PARAMS, new Uint32Array(CHUNK_CELLS), 0, 1),
    )
    expect(seeds).toEqual([subSeedForHook(PARAMS, 'ores.seeded')])
  })
})
