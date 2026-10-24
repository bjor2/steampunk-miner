/**
 * The contact sheet of the SS2 biome looks (ticket 778 under spec #774; the palette lock's
 * acceptance 3: "a contact sheet of all looks at 360 px and 1280+ shows each pair as distinct (hue
 * + motif)", the shape of ticket 746's skin sheet). One row per palette look: the lock's hue pair
 * and ground motif, the colours of its art row, its tile, and the pipeline's reads of the shipped
 * tile at the two screens (`docs/art/ss2-looks/look_post.py`, written into `look-reads.json` with
 * the SHA-256 of the albedo map). Two looks read apart when, at a screen, their tiles' mean colours
 * lie at least an eighth of the channel range apart (ticket 653's rule for a planet's rock) and
 * their motif reads do too, on the motif vector, measured on luma alone so no hue leaks into it:
 * the edge share, half the edge anisotropy across the tile and across its diagonals, the luma
 * spread and the shares of pixels a spread above and below the mean, each 0 to 1. Pure arithmetic
 * over the reads; look only.
 */
import { rgbOfHex, type Rgb } from '../../../../systems/render/colour'
import { ARCHETYPE_PALETTE, type BiomeLook } from '../paletteRows'
import { LOOK_ART, type LookArt } from './lookArt'
import { areColoursApart } from './lookArtGuards'

/** One tile's read at one screen, as `look_post.py` writes it. */
export interface LookScreenRead {
  meanHex: string
  luma: number
  hueDeg: number
  saturation: number
  edgeShare: number
  anisotropy: number
  diagonalAnisotropy: number
  lumaSpread: number
  highShare: number
  lowShare: number
}

/** One look's tile reads at the contact-sheet screens, keyed `360x640` and `1280x800`. */
export interface LookTileRead {
  lookId: string
  tileAssetId: string
  albedoSha256: string
  screens: Record<string, LookScreenRead>
}

export interface LookReads {
  /** The tile's size in pixels at each screen. */
  screens: Record<string, number>
  looks: LookTileRead[]
}

export interface LookSheetRow {
  lookId: string
  act: string
  hue: string
  groundMotif: string
  tileAssetId: string
  rockSurface: string
  horizon: string
  skyBandColour: string
  /** The shipped tile's reads per screen; empty when the pipeline has measured none. */
  reads: Record<string, LookScreenRead>
}

/** The two screens of the contact sheet (ticket 744's gem-read screens): a phone and a desktop. */
export const LOOK_SHEET_SCREENS = ['360x640', '1280x800'] as const

/** Two motifs read apart at an eighth of the motif vector's range, as two rocks do in colour. */
export const MIN_MOTIF_DISTANCE = 32 / 255

export function lookContactSheetOf(reads: LookReads): LookSheetRow[] {
  return ARCHETYPE_PALETTE.looks.map((look) => rowOf(look, artOf(look), readOf(reads, look)))
}

/**
 * Every pair of the sheet a player could not tell apart, as `a vs b at <screen>` lines: at a
 * screen, two tiles whose mean colours lie under an eighth apart, or whose motifs do.
 */
export function unreadableLookPairsOf(rows: readonly LookSheetRow[]): string[] {
  return rows.flatMap((row, at) =>
    rows.slice(at + 1).flatMap((other) => unreadableScreensOf(row, other)),
  )
}

/** The Euclidean distance of two reads' mean colours, in the 0 to 1 channel range. */
export function colourDistanceOf(a: LookScreenRead, b: LookScreenRead): number {
  return distanceOf(rgbOfHex(a.meanHex), rgbOfHex(b.meanHex))
}

/** The Euclidean distance of two reads' motif vectors. */
export function motifDistanceOf(a: LookScreenRead, b: LookScreenRead): number {
  return distanceOf(motifVectorOf(a), motifVectorOf(b))
}

function rowOf(look: BiomeLook, art: LookArt, read: LookTileRead | null): LookSheetRow {
  return {
    lookId: look.id,
    act: look.act,
    hue: look.hue,
    groundMotif: look.groundMotif,
    tileAssetId: art.tileAssetId,
    rockSurface: art.look.rockSurface,
    horizon: art.look.horizon,
    skyBandColour: art.look.skyBand.colour,
    reads: read?.screens ?? {},
  }
}

function artOf(look: BiomeLook): LookArt {
  const art = LOOK_ART.find((candidate) => candidate.lookId === look.id)
  if (art === undefined) throw new RangeError(`look "${look.id}" has no art row`)
  return art
}

function readOf(reads: LookReads, look: BiomeLook): LookTileRead | null {
  return reads.looks.find((read) => read.lookId === look.id) ?? null
}

function unreadableScreensOf(a: LookSheetRow, b: LookSheetRow): string[] {
  return LOOK_SHEET_SCREENS.filter((screen) => !isReadApartAt(a, b, screen)).map(
    (screen) => `${a.lookId} vs ${b.lookId} at ${screen}`,
  )
}

function isReadApartAt(a: LookSheetRow, b: LookSheetRow, screen: string): boolean {
  const [first, second] = [a.reads[screen], b.reads[screen]]
  if (first === undefined || second === undefined) return false
  return isColourApart(first, second) && motifDistanceOf(first, second) >= MIN_MOTIF_DISTANCE
}

function isColourApart(a: LookScreenRead, b: LookScreenRead): boolean {
  return areColoursApart(rgbOfHex(a.meanHex), rgbOfHex(b.meanHex))
}

function motifVectorOf(read: LookScreenRead): readonly number[] {
  return [
    read.edgeShare,
    read.anisotropy / 2,
    read.diagonalAnisotropy / 2,
    read.lumaSpread,
    read.highShare,
    read.lowShare,
  ]
}

function distanceOf(a: readonly number[] | Rgb, b: readonly number[] | Rgb): number {
  return Math.sqrt(a.reduce((sum, value, at) => sum + (value - b[at]) ** 2, 0))
}
