import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { blenderAssetIds, isValidPartId } from '../../../systems/art/artIds'
import { sidecarProblems, type PartsSidecar } from '../../../systems/art/partsSidecar'
import { ORE_ATLAS_ASSET_ID, oreAtlasArtAssetOf, oreAtlasSidecarPartsOf } from './oreAtlasAsset'
import { ORE_LOOKS } from './oreFamilyLooks'

// The atlas ships as one parts asset (#144): the slice registers its id and cell parts, the bake
// writes the sidecar from the same table, and the two must never drift.

const REPO = new URL('../../../../', import.meta.url)
const PLACEHOLDER = new URL(`art/placeholders/${ORE_ATLAS_ASSET_ID}.parts.json`, REPO)
const EXPORTED = new URL(
  `public/assets/ground/${ORE_ATLAS_ASSET_ID}/${ORE_ATLAS_ASSET_ID}.parts.json`,
  REPO,
)

const atlasSlice: SliceDefinition = {
  id: 'ore-visuals',
  register: (r) => r.artAssets([oreAtlasArtAssetOf(ORE_LOOKS)]),
}

const readSidecar = (url: URL): PartsSidecar => JSON.parse(readFileSync(url, 'utf8'))

describe('ore atlas asset', () => {
  it('registers ground-ore-atlas with one part per atlas cell', () => {
    const asset = oreAtlasArtAssetOf(ORE_LOOKS)
    expect(asset).toMatchObject({ id: ORE_ATLAS_ASSET_ID, category: 'ground' })
    expect(asset.parts).toHaveLength(240)
    expect(asset.parts?.[0]).toBe('alien-v0-g1')
    expect(asset.parts?.[239]).toBe('volcanic-v3-g5')
    expect(new Set(asset.parts).size).toBe(240)
  })

  it('joins the Blender asset list and makes every cell a valid part id of the atlas', () => {
    withRegistrations([atlasSlice], () => {
      expect(blenderAssetIds()).toContain(ORE_ATLAS_ASSET_ID)
      expect(isValidPartId(ORE_ATLAS_ASSET_ID, 'crystal-v2-g4')).toBe(true)
      expect(isValidPartId(ORE_ATLAS_ASSET_ID, 'crystal-v4-g1')).toBe(false)
    })
  })

  it('gives each part its content rect and the 248 px cell as metres at 256 px/m', () => {
    const [first] = oreAtlasSidecarPartsOf(ORE_LOOKS)
    expect(first).toEqual({
      id: 'alien-v0-g1',
      tier: 1,
      rect: [4, 4, 248, 248],
      sizeM: [0.96875, 0.96875],
      pivotM: [0.484375, 0.484375],
      atM: [0, 0],
      z: 0,
    })
  })

  it.each([
    ['placeholder', PLACEHOLDER],
    ['exported', EXPORTED],
  ])('ships the %s sidecar with exactly these parts, valid under schema 1', (_, url) => {
    const sidecar = readSidecar(url)
    expect(sidecar.parts).toEqual(oreAtlasSidecarPartsOf(ORE_LOOKS))
    expect(sidecar.atlasPx).toEqual([ORE_LOOKS.atlas.sidePx, ORE_LOOKS.atlas.sidePx])
    withRegistrations([atlasSlice], () => {
      expect(sidecarProblems(ORE_ATLAS_ASSET_ID, sidecar)).toEqual([])
    })
  })
})
