import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAP_KINDS, type MapKind } from './artIds'
import { ASSET_MANIFEST, PLACEHOLDER_SIDECARS, placeholderSidecarOf } from './artCatalogue'
import {
  expectedFilesOf,
  manifestProblems,
  shippedFileProblems,
  SHIPPED_ART_FOLDERS,
  type ManifestEntry,
} from './assetManifest'
import { ktx2MapProblems } from './ktx2Header'
import { mapFilesOf, sidecarProblems, type PartsSidecar } from './partsSidecar'

// The asset lint of #52 acceptance 1-3 and #51 acceptance 1-3, run over the files in the repo.
// It fails `npm test`, so a stray, unlisted or malformed export never reaches a build.

const REPO = new URL('../../../', import.meta.url)

function filesUnder(folder: string): string[] {
  const directory = new URL(folder, REPO)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
    .map((entry) => `${entry.parentPath}/${entry.name}`.slice(new URL(REPO).pathname.length))
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, REPO), 'utf8')) as T

const shipped = SHIPPED_ART_FOLDERS.flatMap(filesUnder)

function shippedSidecarOf(entry: ManifestEntry): PartsSidecar | null {
  const path = expectedFilesOf(entry, [])[0]
  return entry.form === 'parts' && path !== undefined && shipped.includes(path)
    ? readJson<PartsSidecar>(path)
    : null
}

function expectedFilesOfManifest(): string[] {
  return ASSET_MANIFEST.assets.flatMap((entry) => {
    const sidecar = shippedSidecarOf(entry)
    return expectedFilesOf(entry, sidecar === null ? [] : mapFilesOf(sidecar))
  })
}

const mapKindOf = (path: string): MapKind | undefined =>
  MAP_KINDS.find((kind) => path.endsWith(`.${kind}.ktx2`))

describe('asset lint: the manifest', () => {
  it('is the #51 inventory under the #52 naming', () => {
    expect(manifestProblems(ASSET_MANIFEST)).toEqual([])
  })

  it('gives every Blender parts asset a checked-in placeholder sidecar, and lists every one', () => {
    const partsAssets = ASSET_MANIFEST.assets.filter((entry) => entry.form === 'parts')
    expect(partsAssets.filter((entry) => placeholderSidecarOf(entry.id) === null)).toEqual([])
    const onDisk = filesUnder('art/placeholders/').map((path) => path.split('/').pop())
    const listed = PLACEHOLDER_SIDECARS.map((sidecar) => `${sidecar.assetId}.parts.json`)
    expect(onDisk.sort()).toEqual(listed.sort())
  })

  it('colours only parts the placeholder has', () => {
    for (const entry of ASSET_MANIFEST.assets) {
      const partIds = placeholderSidecarOf(entry.id)?.parts.map((part) => part.id) ?? []
      const strays = Object.keys(entry.partColors ?? {}).filter((id) => !partIds.includes(id))
      expect({ asset: entry.id, strays }).toEqual({ asset: entry.id, strays: [] })
    }
  })
})

describe('asset lint: sidecars', () => {
  it('validates every placeholder sidecar against schema 1', () => {
    expect(PLACEHOLDER_SIDECARS.flatMap((s) => sidecarProblems(s.assetId, s))).toEqual([])
  })

  it('validates every exported sidecar against schema 1', () => {
    const exported = ASSET_MANIFEST.assets.flatMap((entry) => {
      const sidecar = shippedSidecarOf(entry)
      return sidecar === null ? [] : sidecarProblems(entry.id, sidecar)
    })
    expect(exported).toEqual([])
  })
})

describe('asset lint: shipped files', () => {
  it('ships every file of a final asset and nothing a manifest entry does not own', () => {
    expect(shippedFileProblems(ASSET_MANIFEST, expectedFilesOfManifest(), shipped)).toEqual([])
  })

  it('encodes every map at most 4096 px with power-of-two sides, in its Basis format', () => {
    const problems = shipped.flatMap((path) => {
      const kind = mapKindOf(path)
      if (kind === undefined) return []
      return ktx2MapProblems(path, kind, new Uint8Array(readFileSync(new URL(path, REPO))))
    })
    expect(problems).toEqual([])
  })
})
