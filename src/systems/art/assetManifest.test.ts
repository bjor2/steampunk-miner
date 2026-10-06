import { describe, expect, it } from 'vitest'
import { ASSET_MANIFEST } from './artCatalogue'
import {
  expectedFilesOf,
  manifestProblems,
  ownerIdOfFile,
  shippedFileProblems,
  type AssetManifest,
  type ManifestEntry,
} from './assetManifest'
import {
  SCHEDULED_ENEMY_ART_ROW_IDS,
  blenderAssetIds,
  enemyArtKinds,
  vectorIconIds,
  vehicleModuleAssetIdOf,
  vehicleModuleRowIds,
} from './artIds'
import { ENEMY_IDS } from '../registeredIds'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

const withEntries = (...entries: ManifestEntry[]): AssetManifest => ({
  schema: 1,
  assets: [
    ...ASSET_MANIFEST.assets.filter((asset) => !entries.some((e) => e.id === asset.id)),
    ...entries,
  ],
})

const finalCrawler: ManifestEntry = {
  id: 'enemy-crawler',
  source: 'blender',
  form: 'parts',
  status: 'final',
}
const placeholderBurrower: ManifestEntry = {
  id: 'enemy-burrower',
  source: 'blender',
  form: 'parts',
  status: 'placeholder',
  color: '#5a3a4a',
}
const crawlerMaps = ['enemy-crawler.albedo.ktx2', 'enemy-crawler.normal.ktx2']
const crawlerFiles = expectedFilesOf(finalCrawler, crawlerMaps)

describe('asset manifest', () => {
  it('names every Blender asset of the #51 inventory from the registries', () => {
    expect(blenderAssetIds()).toEqual(
      expect.arrayContaining([
        'vehicle',
        'platform-hub',
        'platform-bay-sell',
        'platform-bay-upgrade',
        'enemy-crawler',
        'enemy-burrower',
        'prop-artefact-cache',
        'ground-band-5',
        'casing-grade-5',
      ]),
    )
    expect(vectorIconIds()).toEqual(
      expect.arrayContaining(['icon-track-drill-power', 'icon-track-cargo-hold', 'icon-casing']),
    )
  })

  it("names the tunnel wrecker's art from its schedule row before the economy lists the kind", () => {
    expect(ENEMY_IDS).not.toContain('tunnel_wrecker')
    expect(blenderAssetIds()).toContain('enemy-tunnel-wrecker')
  })

  it('takes scheduled enemy art only from Enemy rows of the locked schedule', () => {
    const enemyRowIds = LOCKED_SCHEDULE.rows
      .filter((row) => row.lane === 'Enemy')
      .map((row) => row.id)
    expect(enemyRowIds).toEqual(expect.arrayContaining([...SCHEDULED_ENEMY_ART_ROW_IDS]))
  })

  it("lists each enemy kind's art once, economy kinds first", () => {
    const kinds = enemyArtKinds()
    expect(kinds.slice(0, ENEMY_IDS.length)).toEqual(ENEMY_IDS)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('names each vehicle module from a row of the locked unlock schedule', () => {
    const rowIds = LOCKED_SCHEDULE.rows.map((row) => row.id)
    expect(vehicleModuleRowIds().filter((row) => !rowIds.includes(row))).toEqual([])
    expect(blenderAssetIds()).toContain(vehicleModuleAssetIdOf('auto_guns'))
    expect(vehicleModuleAssetIdOf('auto_guns')).toBe('vehicle-auto-guns')
  })

  it('refuses an asset id that no registry derives, and a missing inventory row', () => {
    const manifest = withEntries({ ...finalCrawler, id: 'enemy-dragon' })
    expect(manifestProblems({ ...manifest, assets: manifest.assets.slice(1) })).toEqual([
      'asset "enemy-dragon": id is not derived from a registry id (#52)',
      'asset "vehicle" from the #51 inventory is missing from the manifest',
    ])
  })

  it('refuses a Blender placeholder without a colour and a form its source cannot have', () => {
    const problems = manifestProblems(
      withEntries({ id: 'enemy-crawler', source: 'blender', form: 'svg', status: 'placeholder' }),
    )
    expect(problems).toEqual([
      'asset "enemy-crawler": a blender asset cannot have the form svg',
      'asset "enemy-crawler": a Blender placeholder needs a #rrggbb color',
    ])
  })

  it('puts a final asset’s sidecar and the maps it names under public/assets/<category>/<id>', () => {
    expect(crawlerFiles).toEqual([
      'public/assets/enemy/enemy-crawler/enemy-crawler.parts.json',
      'public/assets/enemy/enemy-crawler/enemy-crawler.albedo.ktx2',
      'public/assets/enemy/enemy-crawler/enemy-crawler.normal.ktx2',
    ])
    expect(expectedFilesOf({ ...finalCrawler, status: 'placeholder' }, crawlerMaps)).toEqual([])
  })

  it('reads the owner of an export from its folder and of an icon from its file stem', () => {
    expect(ownerIdOfFile('public/assets/enemy/enemy-crawler/enemy-crawler.normal.ktx2')).toBe(
      'enemy-crawler',
    )
    expect(ownerIdOfFile('src/ui/icons/icon-casing.svg')).toBe('icon-casing')
  })
})

describe('asset lint', () => {
  const manifest = withEntries(finalCrawler)

  it('passes when a final asset ships exactly its files', () => {
    expect(shippedFileProblems(manifest, crawlerFiles, crawlerFiles)).toEqual([])
  })

  it('fails a final asset with a missing file', () => {
    expect(shippedFileProblems(manifest, crawlerFiles, crawlerFiles.slice(0, 2))).toEqual([
      'public/assets/enemy/enemy-crawler/enemy-crawler.normal.ktx2: missing',
    ])
  })

  it('fails a shipped file with no manifest entry, or one owned by a placeholder', () => {
    const shipped = [
      'public/assets/enemy/enemy-dragon/enemy-dragon.parts.json',
      'public/assets/enemy/enemy-burrower/enemy-burrower.parts.json',
    ]
    expect(shippedFileProblems(withEntries(placeholderBurrower), [], shipped)).toEqual([
      'public/assets/enemy/enemy-dragon/enemy-dragon.parts.json: has no asset-manifest.json entry',
      'public/assets/enemy/enemy-burrower/enemy-burrower.parts.json: "enemy-burrower" is a placeholder, which ships no files',
    ])
  })

  it('fails a raster icon, which is not a file a vector icon ships', () => {
    const icon: ManifestEntry = {
      id: 'icon-casing',
      source: 'vector',
      form: 'svg',
      status: 'final',
    }
    const expected = expectedFilesOf(icon, [])
    expect(
      shippedFileProblems(withEntries(icon), expected, ['src/ui/icons/icon-casing.png']),
    ).toEqual([
      'src/ui/icons/icon-casing.png: is not a file a svg asset ships',
      'src/ui/icons/icon-casing.svg: missing',
    ])
  })
})
