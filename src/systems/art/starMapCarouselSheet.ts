/**
 * The contact sheet of the star map carousel's planet previews (ticket 795, spec #647: "a contact
 * sheet golden of all previews side by side, showing that every look reads distinctly in hue and
 * motif", the shape of ticket 778's look sheet). One row per preview asset: its look key, name and
 * motif, the colours its crust and haze are authored in, and the pipeline's reads of the shipped
 * hero at the two carousel screens (`docs/art/star-map-carousel/preview_post.py`, written into
 * `preview-reads.json` with the SHA-256 of the 2x hero PNG). Two previews read apart when, at a
 * screen, their sprites' mean colours lie at least an eighth of the channel range apart (ticket
 * 653's rule for a planet's rock) or their motif reads do, on the motif vector measured over the
 * planet's disc on luma with the sphere's shading taken out: the edge share, half the edge
 * anisotropy across the disc and across its diagonals, the luma spread and the shares of pixels a
 * spread above and below the mean, each 0 to 1. One of the two is enough (the two-of-three spirit
 * of ticket 746's skin sheet): the looks' rows share hues on purpose within an act (ticket 775's
 * hue pairs), so a pair of a warm grey and a warm brown is told apart by its motif, and a pair of
 * two striped crusts by its hue. Pure arithmetic over the reads; look only.
 */
import { rgbOfHex, type Rgb } from '../render/colour'

/** One hero's read at one screen, as `preview_post.py` writes it. */
export interface PreviewScreenRead {
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

/** One look's hero reads at the carousel screens, keyed `360x640` and `1440x900`. */
export interface PreviewRead {
  lookKey: string
  name: string
  motif: string
  previewAssetId: string
  rockSurface: string
  horizon: string
  heroSha256: string
  screens: Record<string, PreviewScreenRead>
}

export interface PreviewReads {
  /** The hero's CSS size at each screen. */
  screens: Record<string, number>
  looks: PreviewRead[]
}

export interface PreviewSheetRow {
  lookKey: string
  name: string
  motif: string
  previewAssetId: string
  rockSurface: string
  horizon: string
  /** The shipped hero's reads per screen; empty when the pipeline has measured none. */
  reads: Record<string, PreviewScreenRead>
}

/** The two carousel screens: the hero at 160 px on a phone and at 256 px in the desktop dock. */
export const PREVIEW_SHEET_SCREENS = ['360x640', '1440x900'] as const

/** An eighth of the channel range, the floor two rocks keep apart (ticket 653); motifs the same. */
export const MIN_PREVIEW_DISTANCE = 32 / 255

/** The sheet in the pipeline's order: the first system's places, then the palette's looks. */
export function previewContactSheetOf(reads: PreviewReads): PreviewSheetRow[] {
  return reads.looks.map(rowOf)
}

/**
 * Every pair of the sheet a player could not tell apart, as `a vs b at <screen>` lines: at a
 * screen, two heroes whose mean colours lie under an eighth apart and whose motifs do too.
 */
export function unreadablePreviewPairsOf(rows: readonly PreviewSheetRow[]): string[] {
  return rows.flatMap((row, at) =>
    rows.slice(at + 1).flatMap((other) => unreadableScreensOf(row, other)),
  )
}

/** The Euclidean distance of two reads' mean colours, in the 0 to 1 channel range. */
export function previewColourDistanceOf(a: PreviewScreenRead, b: PreviewScreenRead): number {
  return distanceOf(rgbOfHex(a.meanHex), rgbOfHex(b.meanHex))
}

/** The Euclidean distance of two reads' motif vectors. */
export function previewMotifDistanceOf(a: PreviewScreenRead, b: PreviewScreenRead): number {
  return distanceOf(motifVectorOf(a), motifVectorOf(b))
}

function rowOf(read: PreviewRead): PreviewSheetRow {
  return {
    lookKey: read.lookKey,
    name: read.name,
    motif: read.motif,
    previewAssetId: read.previewAssetId,
    rockSurface: read.rockSurface,
    horizon: read.horizon,
    reads: read.screens,
  }
}

function unreadableScreensOf(a: PreviewSheetRow, b: PreviewSheetRow): string[] {
  return PREVIEW_SHEET_SCREENS.filter((screen) => !isReadApartAt(a, b, screen)).map(
    (screen) => `${a.lookKey} vs ${b.lookKey} at ${screen}`,
  )
}

function isReadApartAt(a: PreviewSheetRow, b: PreviewSheetRow, screen: string): boolean {
  const [first, second] = [a.reads[screen], b.reads[screen]]
  if (first === undefined || second === undefined) return false
  return (
    previewColourDistanceOf(first, second) >= MIN_PREVIEW_DISTANCE ||
    previewMotifDistanceOf(first, second) >= MIN_PREVIEW_DISTANCE
  )
}

function motifVectorOf(read: PreviewScreenRead): readonly number[] {
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
