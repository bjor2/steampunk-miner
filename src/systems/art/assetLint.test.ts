import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_PLATFORM_PARTS } from '../../constants/scene'
import { MAP_KINDS, slotItemAssetIdOf, type MapKind } from './artIds'
import { attachCoverageProblems, attachedItemsOfRegistries } from '../registries/attachCoverage'
import { ATTACH_ASSET_ID, attachIdsOf } from './sidecarAttach'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { exportedSidecarOf, placeholderSidecarOf } from './artCatalogue'
import {
  expectedFilesOf,
  manifestProblems,
  ownerIdOfFile,
  shippedFileProblems,
  SHIPPED_ART_FOLDERS,
  type ManifestEntry,
} from './assetManifest'
import { ktx2MapProblems, ktx2TileProblems } from './ktx2Header'
import {
  mapFilesOf,
  placeholderDriftProblems,
  sidecarProblems,
  type PartsSidecar,
} from './partsSidecar'

// The asset lint of #52 acceptance 1-3 and #51 acceptance 1-3, run over the files in the repo.
// It fails `npm test`, so a stray, unlisted or malformed export never reaches a build.

const REPO = new URL('../../../', import.meta.url)
const REPO_DIR = fileURLToPath(REPO)

function filesUnder(folder: string): string[] {
  const directory = new URL(folder, REPO)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(REPO_DIR, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
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
  return SHIPPED_ART.manifest.assets.flatMap((entry) => {
    const sidecar = shippedSidecarOf(entry)
    return expectedFilesOf(entry, sidecar === null ? [] : mapFilesOf(sidecar))
  })
}

const partTiersOf = (sidecar: PartsSidecar): string[] =>
  sidecar.parts.map((part) => `${part.id}@${part.tier}`).sort()

const mapKindOf = (path: string): MapKind | undefined =>
  MAP_KINDS.find((kind) => path.endsWith(`.${kind}.ktx2`))

const isTileMap = (path: string): boolean =>
  SHIPPED_ART.manifest.assets.some(
    (entry) => entry.form === 'tile' && entry.id === ownerIdOfFile(path),
  )

describe('asset lint: the manifest', () => {
  it('is the #51 inventory under the #52 naming', () => {
    expect(manifestProblems(SHIPPED_ART.manifest)).toEqual([])
  })

  it('keeps one entry file per asset under art/assets, named for the id it holds (#116)', () => {
    const entryFiles = filesUnder('art/assets/')
    const misnamed = entryFiles.filter(
      (path) => path !== `art/assets/${readJson<ManifestEntry>(path).id}.json`,
    )
    expect(misnamed).toEqual([])
    expect(entryFiles).toHaveLength(SHIPPED_ART.manifest.assets.length)
  })

  it('gives every Blender parts asset a checked-in placeholder sidecar, and lists every one', () => {
    const partsAssets = SHIPPED_ART.manifest.assets.filter((entry) => entry.form === 'parts')
    expect(
      partsAssets.filter((entry) => placeholderSidecarOf(SHIPPED_ART, entry.id) === null),
    ).toEqual([])
    const onDisk = filesUnder('art/placeholders/').map((path) => path.split('/').pop())
    const listed = SHIPPED_ART.placeholderSidecars.map((sidecar) => `${sidecar.assetId}.parts.json`)
    expect(onDisk.sort()).toEqual(listed.sort())
  })

  it('colours only parts the placeholder has', () => {
    for (const entry of SHIPPED_ART.manifest.assets) {
      const partIds =
        placeholderSidecarOf(SHIPPED_ART, entry.id)?.parts.map((part) => part.id) ?? []
      const strays = Object.keys(entry.partColors ?? {}).filter((id) => !partIds.includes(id))
      expect({ asset: entry.id, strays }).toEqual({ asset: entry.id, strays: [] })
    }
  })
})

describe('asset lint: sidecars', () => {
  it('validates every placeholder sidecar against schema 1', () => {
    expect(SHIPPED_ART.placeholderSidecars.flatMap((s) => sidecarProblems(s.assetId, s))).toEqual(
      [],
    )
  })

  it('validates every exported sidecar against schema 1', () => {
    const exported = SHIPPED_ART.manifest.assets.flatMap((entry) => {
      const sidecar = shippedSidecarOf(entry)
      return sidecar === null ? [] : sidecarProblems(entry.id, sidecar)
    })
    expect(exported).toEqual([])
  })

  it('keeps every exported asset on its placeholder part ids and map files (S7a-d acceptance 2)', () => {
    const drift = SHIPPED_ART.manifest.assets.flatMap((entry) => {
      const [placeholder, sidecar] = [
        placeholderSidecarOf(SHIPPED_ART, entry.id),
        shippedSidecarOf(entry),
      ]
      return placeholder === null || sidecar === null
        ? []
        : placeholderDriftProblems(placeholder, sidecar)
    })
    expect(drift).toEqual([])
  })
})

// K5 #188: the #162 coverage rule over the items the loaded slices register, against the attach
// points of the vehicle sidecars the game draws from.
describe('asset lint: attach coverage', () => {
  const vehicleSidecars = [
    placeholderSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID),
    exportedSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID),
  ]

  it('places every registered item at an attach point the vehicle sidecars carry', () => {
    const problems = vehicleSidecars.flatMap((sidecar) =>
      sidecar === null
        ? [`no ${ATTACH_ASSET_ID} sidecar`]
        : attachCoverageProblems(attachedItemsOfRegistries(), attachIdsOf(sidecar)),
    )
    expect(problems).toEqual([])
  })

  it('ships a model for every item drawn at its power-up slot (TD on #162)', () => {
    const listed = SHIPPED_ART.manifest.assets.map((entry) => entry.id)
    const missing = attachedItemsOfRegistries()
      .filter((item) => item.attach === 'slot')
      .map((item) => slotItemAssetIdOf(item.id))
      .filter((assetId) => !listed.includes(assetId))
    expect(missing).toEqual([])
  })
})

describe('asset lint: final art replaces its placeholder', () => {
  it('lists every exported sidecar on disk in the catalogue the game draws from', () => {
    const onDisk = shipped.filter((path) => path.endsWith('.parts.json'))
    const listed = SHIPPED_ART.exportedSidecars.map((sidecar) => `${sidecar.assetId}.parts.json`)
    expect(onDisk.map((path) => path.split('/').pop()).sort()).toEqual(listed.sort())
  })

  it('keeps the placeholder’s part ids and tiers in every exported sidecar (S7a-d acceptance)', () => {
    for (const exported of SHIPPED_ART.exportedSidecars) {
      const placeholder = placeholderSidecarOf(SHIPPED_ART, exported.assetId)
      expect({ asset: exported.assetId, parts: partTiersOf(exported) }).toEqual({
        asset: exported.assetId,
        parts: placeholder === null ? [] : partTiersOf(placeholder),
      })
    }
  })

  it('names the same maps as the placeholder, so texture ids match it too', () => {
    for (const exported of SHIPPED_ART.exportedSidecars) {
      const placeholder = placeholderSidecarOf(SHIPPED_ART, exported.assetId)
      expect(mapFilesOf(exported)).toEqual(placeholder === null ? [] : mapFilesOf(placeholder))
    }
  })
})

describe('asset lint: render budget', () => {
  it('keeps the shop buildings, the Refinery and the add-ons to come within 48 parts (#170)', () => {
    const platformParts = SHIPPED_ART.manifest.assets
      .filter((entry) => entry.form === 'parts' && entry.id.startsWith('platform-'))
      .flatMap(
        (entry) =>
          (shippedSidecarOf(entry) ?? placeholderSidecarOf(SHIPPED_ART, entry.id))?.parts ?? [],
      )
    expect(platformParts.length).toBeLessThanOrEqual(MAX_PLATFORM_PARTS)
  })
})

describe('asset lint: shipped files', () => {
  it('ships every file of a final asset and nothing a manifest entry does not own', () => {
    expect(shippedFileProblems(SHIPPED_ART.manifest, expectedFilesOfManifest(), shipped)).toEqual(
      [],
    )
  })

  it('encodes every map at most 4096 px with power-of-two sides, in its Basis format', () => {
    const problems = shipped.flatMap((path) => {
      const kind = mapKindOf(path)
      if (kind === undefined) return []
      return ktx2MapProblems(path, kind, new Uint8Array(readFileSync(new URL(path, REPO))))
    })
    expect(problems).toEqual([])
  })

  it('ships every ground and casing map as the 1024 px square tile of #52', () => {
    const problems = shipped
      .filter((path) => path.endsWith('.ktx2') && isTileMap(path))
      .flatMap((path) => ktx2TileProblems(path, new Uint8Array(readFileSync(new URL(path, REPO)))))
    expect(problems).toEqual([])
  })
})
