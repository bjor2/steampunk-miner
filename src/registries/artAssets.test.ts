import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../scene/shippedArt'
import { blenderAssetIds, isValidPartId, kernelBlenderAssetIds } from '../systems/art/artIds'
import {
  expectedFilesOf,
  manifestProblems,
  shippedFileProblems,
  type AssetManifest,
  type ManifestEntry,
} from '../systems/art/assetManifest'
import type { ArtAsset } from '../systems/registries/artAssets'
import { RegistrationRefusedError } from '../systems/registries/seal'
import { withRegistrations } from './registrar'
import type { SliceDefinition } from './sliceDefinition'

function sliceShipping(sliceId: string, ...assets: ArtAsset[]): SliceDefinition {
  return { id: sliceId, register: (r) => r.artAssets(assets) }
}

const FIXTURE_ASSET: ArtAsset = {
  id: 'prop-fixture-charge',
  category: 'prop',
  parts: ['fixture-lamp'],
}
const FIXTURE_SLICE = sliceShipping('fixture-props', FIXTURE_ASSET)

// What the slice would commit: `art/assets/prop-fixture-charge.json` and its export.
const FIXTURE_ENTRY: ManifestEntry = {
  id: FIXTURE_ASSET.id,
  source: 'blender',
  form: 'parts',
  status: 'final',
}
const FIXTURE_FILES = expectedFilesOf(FIXTURE_ENTRY, [
  'prop-fixture-charge.albedo.ktx2',
  'prop-fixture-charge.normal.ktx2',
])
const MANIFEST_WITH_FIXTURE: AssetManifest = {
  assets: [...SHIPPED_ART.manifest.assets, FIXTURE_ENTRY],
}

function assetLintProblems(): string[] {
  return [
    ...manifestProblems(MANIFEST_WITH_FIXTURE),
    ...shippedFileProblems(MANIFEST_WITH_FIXTURE, FIXTURE_FILES, FIXTURE_FILES),
  ]
}

describe('art assets from slices', () => {
  it('keeps the kernel list, sorted, when no slice registers an asset', () => {
    const ids = withRegistrations([], blenderAssetIds)
    expect(ids).toEqual([...kernelBlenderAssetIds()].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('adds a registered id to the kernel list in sorted order', () => {
    const ids = withRegistrations([FIXTURE_SLICE], blenderAssetIds)
    expect(ids).toEqual([...kernelBlenderAssetIds(), FIXTURE_ASSET.id].sort())
  })

  it("passes the asset lint with the slice's entry and exported files", () => {
    expect(withRegistrations([FIXTURE_SLICE], assetLintProblems)).toEqual([])
  })

  it('fails the asset lint on the same files without the registration', () => {
    expect(withRegistrations([], assetLintProblems)).toContain(
      'asset "prop-fixture-charge": id is not derived from a registry id (#52)',
    )
  })

  it("accepts the parts the slice names as the asset's part ids", () => {
    const isLampValid = () => isValidPartId(FIXTURE_ASSET.id, 'fixture-lamp')
    expect(withRegistrations([FIXTURE_SLICE], isLampValid)).toBe(true)
    expect(withRegistrations([], isLampValid)).toBe(false)
  })

  it('refuses an id that is not kebab-case', () => {
    const slice = sliceShipping('fixture-props', { id: 'prop-Fixture_charge', category: 'prop' })
    expect(() => withRegistrations([slice], () => undefined)).toThrow(/not kebab-case/)
  })

  it('refuses an id outside its category', () => {
    const slice = sliceShipping('fixture-props', { id: 'fixture-charge', category: 'prop' })
    expect(() => withRegistrations([slice], () => undefined)).toThrow(/start with "prop-"/)
  })

  it('refuses an id the kernel already names', () => {
    const slice = sliceShipping('fixture-props', { id: 'prop-artefact-cache', category: 'prop' })
    expect(() => withRegistrations([slice], () => undefined)).toThrow(/kernel asset id/)
  })

  it('refuses an id another slice already registered', () => {
    const twin = sliceShipping('fixture-twin', FIXTURE_ASSET)
    expect(() => withRegistrations([FIXTURE_SLICE, twin], () => undefined)).toThrow(
      RegistrationRefusedError,
    )
  })
})
