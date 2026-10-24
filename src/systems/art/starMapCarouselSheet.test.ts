import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { blenderAssetIds } from './artIds'
import { exportedSidecarOf, manifestEntryOf } from './artCatalogue'
import golden from './starMapCarouselSheet.golden.json'
import {
  lookKeyOfPreviewAsset,
  STAR_MAP_DOT,
  STAR_MAP_HERO,
  STAR_MAP_SYSTEM,
  STAR_MAP_SYSTEM_ASSET_ID,
  starMapPreviewPartIds,
  starMapSystemPartIds,
} from './starMapCarouselArt'
import {
  MIN_PREVIEW_DISTANCE,
  PREVIEW_SHEET_SCREENS,
  previewColourDistanceOf,
  previewContactSheetOf,
  previewMotifDistanceOf,
  unreadablePreviewPairsOf,
  type PreviewReads,
  type PreviewSheetRow,
} from './starMapCarouselSheet'
import { shippedFilesOf } from './partsSidecar'

// The contact sheet of the star map carousel's previews (ticket 795): every registered preview,
// the first system's five and the solar-systems slice's eight, read apart in hue and motif at the
// phone and desktop hero sizes from the pipeline's reads of the shipped heroes, pinned as a golden.

const PUBLIC = new URL('../../../public/', import.meta.url)
const CAROUSEL_ART = new URL('../../../docs/art/star-map-carousel/', import.meta.url)
const READS = JSON.parse(
  readFileSync(new URL('preview-reads.json', CAROUSEL_ART), 'utf8'),
) as PreviewReads
const SHEET = previewContactSheetOf(READS)

function sha256Of(path: string): string {
  return createHash('sha256')
    .update(readFileSync(new URL(path, PUBLIC)))
    .digest('hex')
}

function registeredPreviewIds(): string[] {
  return blenderAssetIds().filter((id) => lookKeyOfPreviewAsset(id) !== null)
}

function shippedPathsOf(assetId: string): string[] {
  const sidecar = exportedSidecarOf(SHIPPED_ART, assetId)
  return sidecar === null
    ? []
    : shippedFilesOf(sidecar).map((file) => `assets/ui/${assetId}/${file}`)
}

describe('star map carousel contact sheet', () => {
  it('lists every registered preview once, the first system’s places before the palette’s looks', () => {
    expect(SHEET.map((row) => row.previewAssetId).sort()).toEqual(registeredPreviewIds().sort())
    expect(SHEET.map((row) => row.lookKey)).toEqual(READS.looks.map((look) => look.lookKey))
    expect(SHEET.slice(0, 5).map((row) => row.lookKey)).toEqual(['1', '2', '3', '4', '5'])
    for (const row of SHEET) {
      expect(row.previewAssetId).toBe(`ui-star-map-planet-${row.lookKey}`)
      expect(row.name.length).toBeGreaterThan(0)
      expect(row.motif.length).toBeGreaterThan(0)
    }
  })

  it('ships every preview and the system strip final, with every sprite file on disk', () => {
    for (const assetId of [...registeredPreviewIds(), STAR_MAP_SYSTEM_ASSET_ID]) {
      expect(manifestEntryOf(SHIPPED_ART, assetId)?.status).toBe('final')
      const paths = shippedPathsOf(assetId)
      expect(paths.length).toBeGreaterThan(0)
      for (const path of paths) expect(existsSync(new URL(path, PUBLIC)), path).toBe(true)
    }
  })

  it('bakes each hero, dot and strip part at the brief’s size, one unit per CSS px', () => {
    for (const assetId of registeredPreviewIds()) {
      const exported = exportedSidecarOf(SHIPPED_ART, assetId)
      expect(exported?.pxPerMetre).toBe(4)
      expect(exported?.parts.map((part) => part.id).sort()).toEqual(
        [...starMapPreviewPartIds(assetId)].sort(),
      )
      const [hero, dot] = starMapPreviewPartIds(assetId).map((id) =>
        exported?.parts.find((part) => part.id === id),
      )
      expect(hero?.sizeM).toEqual([STAR_MAP_HERO.sizePx, STAR_MAP_HERO.sizePx])
      expect(dot?.sizeM).toEqual([STAR_MAP_DOT.sizePx, STAR_MAP_DOT.sizePx])
    }
    const strip = exportedSidecarOf(SHIPPED_ART, STAR_MAP_SYSTEM_ASSET_ID)
    expect(strip?.parts.map((part) => part.id).sort()).toEqual([...starMapSystemPartIds()].sort())
    expect(strip?.parts.find((part) => part.id === STAR_MAP_SYSTEM_ASSET_ID)?.sizeM).toEqual(
      STAR_MAP_SYSTEM.sizePx,
    )
    expect(strip?.parts.find((part) => part.id.endsWith('-frame'))?.insetPx).toEqual([
      STAR_MAP_SYSTEM.frame.insetPx,
      STAR_MAP_SYSTEM.frame.insetPx,
    ])
  })

  it('reads every hero at both screens from the 2x file that ships, so a stale read fails', () => {
    for (const row of SHEET) {
      const read = READS.looks.find((candidate) => candidate.lookKey === row.lookKey)
      expect(read, row.lookKey).toBeDefined()
      expect(read!.heroSha256).toBe(
        sha256Of(`assets/ui/${row.previewAssetId}/${row.previewAssetId}@2x.png`),
      )
      expect(Object.keys(read!.screens).sort()).toEqual([...PREVIEW_SHEET_SCREENS].sort())
    }
  })

  it('reads every pair of previews apart in hue or in motif at 360x640 and at 1440x900', () => {
    expect(unreadablePreviewPairsOf(SHEET)).toEqual([])
    for (const [at, row] of SHEET.entries()) {
      for (const other of SHEET.slice(at + 1)) {
        for (const screen of PREVIEW_SHEET_SCREENS) {
          const apart = Math.max(
            previewColourDistanceOf(row.reads[screen], other.reads[screen]),
            previewMotifDistanceOf(row.reads[screen], other.reads[screen]),
          )
          expect({ pair: `${row.lookKey} vs ${other.lookKey} at ${screen}`, apart }).toEqual({
            pair: `${row.lookKey} vs ${other.lookKey} at ${screen}`,
            apart: expect.closeTo(Math.max(apart, MIN_PREVIEW_DISTANCE), 6),
          })
        }
      }
    }
  })

  it('equals the committed golden', () => {
    expect(SHEET).toEqual(golden.rows)
  })

  it('names a twin that shares both its colour and its motif at a screen, and no pair apart in one', () => {
    const [first, second] = SHEET
    const twin: PreviewSheetRow = { ...first, lookKey: 'twin' }
    const sameColour: PreviewSheetRow = {
      ...first,
      lookKey: 'echo',
      reads: Object.fromEntries(
        PREVIEW_SHEET_SCREENS.map((screen) => [
          screen,
          { ...first.reads[screen], edgeShare: first.reads[screen].edgeShare + 0.5 },
        ]),
      ),
    }
    expect(unreadablePreviewPairsOf([first, twin])).toEqual([
      `${first.lookKey} vs twin at 360x640`,
      `${first.lookKey} vs twin at 1440x900`,
    ])
    expect(unreadablePreviewPairsOf([first, sameColour])).toEqual([])
    expect(unreadablePreviewPairsOf([first, { ...second, reads: {} }])).toHaveLength(2)
  })
})
