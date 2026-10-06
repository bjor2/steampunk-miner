import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import {
  expectedFilesOf,
  manifestProblems,
  ownerIdOfFile,
  shippedFileProblems,
  type AssetManifest,
  type ManifestEntry,
} from './assetManifest'
import { blenderAssetIds, enemyArtKinds, vectorIconIds } from './artIds'
import { ENEMY_IDS } from '../registeredIds'

const withEntries = (...entries: ManifestEntry[]): AssetManifest => ({
  assets: [
    ...SHIPPED_ART.manifest.assets.filter((asset) => !entries.some((e) => e.id === asset.id)),
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

  it("lists each enemy kind's art once, economy kinds first", () => {
    const kinds = enemyArtKinds()
    expect(kinds.slice(0, ENEMY_IDS.length)).toEqual(ENEMY_IDS)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('refuses an asset id that no registry derives, and a missing inventory row', () => {
    const manifest = withEntries({ ...finalCrawler, id: 'enemy-dragon' })
    const assets = manifest.assets.filter((entry) => entry.id !== 'vehicle')
    expect(manifestProblems({ assets })).toEqual([
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

  it('ships a glowing tile’s emissive map beside its albedo and normal maps', () => {
    const tile: ManifestEntry = {
      id: 'casing-grade-2',
      source: 'blender',
      form: 'tile',
      status: 'final',
      color: '#5c6066',
    }
    const folder = 'public/assets/casing/casing-grade-2/casing-grade-2'
    expect(expectedFilesOf(tile, [])).toEqual([`${folder}.albedo.ktx2`, `${folder}.normal.ktx2`])
    expect(expectedFilesOf({ ...tile, emissive: true }, [])).toEqual([
      `${folder}.albedo.ktx2`,
      `${folder}.normal.ktx2`,
      `${folder}.emissive.ktx2`,
    ])
  })

  it('refuses an emissive flag on anything but a tile, whose sidecar would say it instead', () => {
    expect(manifestProblems(withEntries({ ...finalCrawler, emissive: true }))).toEqual([
      'asset "enemy-crawler": only a tile says emissive; a parts sidecar names its own maps',
    ])
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
      'public/assets/enemy/enemy-dragon/enemy-dragon.parts.json: has no art/assets entry',
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
