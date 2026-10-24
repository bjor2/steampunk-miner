import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { manifestEntryOf } from '../../../../systems/art/artCatalogue'
import { tileMapsOf } from '../../../../systems/art/tileLook'
import { rgbOfHex } from '../../../../systems/render/colour'
import golden from '../../lookContactSheet.golden.json'
import { ARCHETYPE_PALETTE } from '../paletteRows'
import { areColoursApart } from './lookArtGuards'
import {
  colourDistanceOf,
  LOOK_SHEET_SCREENS,
  lookContactSheetOf,
  MIN_MOTIF_DISTANCE,
  motifDistanceOf,
  unreadableLookPairsOf,
  type LookReads,
  type LookSheetRow,
} from './lookContactSheet'

// The contact sheet of the eight SS2 looks (ticket 778; the palette lock's acceptance 3): every
// look's shipped tile against every other at 360x640 and 1280x800, from the pipeline's reads of
// the maps on disk (`docs/art/ss2-looks/look-reads.json`), and the sheet pinned as a golden.

const PUBLIC = new URL('../../../../../public/', import.meta.url)
const LOOKS_ART = new URL('../../../../../docs/art/ss2-looks/', import.meta.url)
const LOOK_READS = JSON.parse(
  readFileSync(new URL('look-reads.json', LOOKS_ART), 'utf8'),
) as LookReads
const SHEET = lookContactSheetOf(LOOK_READS)

function sha256Of(path: string): string {
  return createHash('sha256')
    .update(readFileSync(new URL(path, PUBLIC)))
    .digest('hex')
}

function readsOf(lookId: string) {
  return SHEET.find((row) => row.lookId === lookId)?.reads ?? {}
}

describe('SS2 look contact sheet', () => {
  it('lists every palette look once with its act, hue pair, motif, art colours and tile', () => {
    expect(SHEET.map((row) => row.lookId)).toEqual(ARCHETYPE_PALETTE.looks.map((look) => look.id))
    for (const row of SHEET) {
      expect(row).toMatchObject({ tileAssetId: `ground-look-${row.lookId}` })
      expect(row.hue).toContain('/')
    }
  })

  it('ships every look tile final, with its albedo and normal maps on disk', () => {
    for (const row of SHEET) {
      expect(manifestEntryOf(SHIPPED_ART, row.tileAssetId)?.status).toBe('final')
      const maps = tileMapsOf(SHIPPED_ART, row.tileAssetId)
      expect(maps).not.toBeNull()
      expect(existsSync(new URL(maps!.albedo, PUBLIC))).toBe(true)
      expect(existsSync(new URL(maps!.normal, PUBLIC))).toBe(true)
    }
  })

  it('reads every tile at both screens from the albedo map that ships, so a stale read fails', () => {
    for (const row of SHEET) {
      const read = LOOK_READS.looks.find((candidate) => candidate.lookId === row.lookId)
      expect(read, row.lookId).toBeDefined()
      expect(read!.albedoSha256).toBe(sha256Of(tileMapsOf(SHIPPED_ART, row.tileAssetId)!.albedo))
      expect(Object.keys(read!.screens).sort()).toEqual([...LOOK_SHEET_SCREENS].sort())
    }
  })

  it('reads every pair of looks apart in hue and in motif at 360x640 and at 1280x800', () => {
    expect(unreadableLookPairsOf(SHEET)).toEqual([])
    for (const [at, row] of SHEET.entries()) {
      for (const other of SHEET.slice(at + 1)) {
        for (const screen of LOOK_SHEET_SCREENS) {
          expect(colourDistanceOf(row.reads[screen], other.reads[screen])).toBeGreaterThanOrEqual(
            MIN_MOTIF_DISTANCE,
          )
          expect(motifDistanceOf(row.reads[screen], other.reads[screen])).toBeGreaterThanOrEqual(
            MIN_MOTIF_DISTANCE,
          )
        }
      }
    }
  })

  it("draws each tile at its look's surface rock: the mean at each screen lies within an eighth of it", () => {
    for (const row of SHEET) {
      for (const screen of LOOK_SHEET_SCREENS) {
        const mean = rgbOfHex(row.reads[screen].meanHex)
        const rock = rgbOfHex(row.rockSurface)
        expect(
          areColoursApart(mean, rock),
          `${row.lookId} at ${screen}: ${row.reads[screen].meanHex} vs ${row.rockSurface}`,
        ).toBe(false)
      }
    }
  })

  it('equals the committed golden', () => {
    expect(SHEET).toEqual(golden.rows)
  })

  it('names a pair that shares its colour or its motif at a screen', () => {
    const [first, second] = SHEET
    const sameColour: LookSheetRow = {
      ...second,
      lookId: 'twin',
      reads: Object.fromEntries(
        LOOK_SHEET_SCREENS.map((screen) => [
          screen,
          { ...second.reads[screen], meanHex: first.reads[screen].meanHex },
        ]),
      ),
    }
    const sameMotif: LookSheetRow = {
      ...second,
      lookId: 'echo',
      reads: Object.fromEntries(
        LOOK_SHEET_SCREENS.map((screen) => [
          screen,
          { ...first.reads[screen], meanHex: second.reads[screen].meanHex },
        ]),
      ),
    }
    expect(unreadableLookPairsOf([first, sameColour])).toEqual([
      `${first.lookId} vs twin at 360x640`,
      `${first.lookId} vs twin at 1280x800`,
    ])
    expect(unreadableLookPairsOf([first, sameMotif])).toEqual([
      `${first.lookId} vs echo at 360x640`,
      `${first.lookId} vs echo at 1280x800`,
    ])
    expect(unreadableLookPairsOf([first, { ...second, reads: {} }])).toHaveLength(2)
    expect(readsOf(first.lookId)).toBe(first.reads)
  })
})
