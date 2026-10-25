/**
 * The planet gem overlays (ticket 889; the HS's condition in the GD's Materials Expansion lock of
 * 25 Oct 2026: "a recolour alone isn't enough, hence the overlay"): a generated gem draws a cut of
 * the gem-cut library coloured by its kind's hue, and over the hue its planet lays one facet or
 * inclusion overlay, the same on every gem of the planet, chosen by the planet's address alone (the
 * `gem-cuts` slice picks it from `(s, p)`). A row names a pattern the terrain shader already draws
 * for the kinds' grains (`kindLooks.json`) and the signed strength it modulates the cut's own luma
 * by before the hue goes on, so a highlight stays a highlight and the facets stay readable: every
 * row sits within `strengthCap` (HS condition 2 on #746, the #450 reads). The shader reads the
 * pattern code and strength from one uniform (`terrainKindLooks.ts` `uGemCuts`). Look only: no
 * price, gate, income, save or digest reads it.
 */
import { KIND_LOOKS, patternCodeOf, type KindLookCatalogue } from './kindLooks'
import overlayFile from './gemOverlays.json'

export interface GemOverlay {
  id: string
  /** A pattern id of the kind look catalogue. */
  pattern: string
  /** How far the pattern's value swings the cut's luma, signed; never 0. */
  strength: number
}

export interface GemOverlayCatalogue {
  /** The largest magnitude a row's strength may have. */
  strengthCap: number
  /** In file order; a new row is appended. */
  overlays: readonly GemOverlay[]
}

/** What the shader reads for a planet: the overlay's pattern code and strength. */
export interface GemOverlayLook {
  patternCode: number
  strength: number
}

/** No overlay: the pattern code of no look, strength 0. */
export const NO_GEM_OVERLAY_LOOK: GemOverlayLook = { patternCode: 0, strength: 0 }

type Raw = Record<string, unknown>

export const GEM_OVERLAYS: GemOverlayCatalogue = loadGemOverlays(overlayFile)

export function loadGemOverlays(
  raw: unknown,
  catalogue: KindLookCatalogue = KIND_LOOKS,
): GemOverlayCatalogue {
  const problems = gemOverlayProblems(raw, catalogue)
  if (problems.length > 0) throw new Error(`gemOverlays.json is refused:\n${problems.join('\n')}`)
  const file = raw as Raw
  return {
    strengthCap: file.strengthCap as number,
    overlays: (file.overlays as GemOverlay[]).map(({ id, pattern, strength }) => ({
      id,
      pattern,
      strength,
    })),
  }
}

/** The overlay with `id`, or null for none. */
export function gemOverlayOf(
  id: string,
  overlays: GemOverlayCatalogue = GEM_OVERLAYS,
): GemOverlay | null {
  return overlays.overlays.find((overlay) => overlay.id === id) ?? null
}

/** What the shader draws for an overlay: its pattern's code and its strength. */
export function gemOverlayLookOf(
  overlay: GemOverlay | null,
  catalogue: KindLookCatalogue = KIND_LOOKS,
): GemOverlayLook {
  if (overlay === null) return NO_GEM_OVERLAY_LOOK
  return { patternCode: patternCodeOf(overlay.pattern, catalogue), strength: overlay.strength }
}

/** Why a file is not an overlay catalogue; empty when it may ship. */
export function gemOverlayProblems(
  raw: unknown,
  catalogue: KindLookCatalogue = KIND_LOOKS,
): string[] {
  const file = (raw ?? {}) as Raw
  const shape = fileShapeProblems(file)
  if (shape.length > 0) return shape
  const rows = file.overlays as Raw[]
  const cap = file.strengthCap as number
  return [
    ...rows.flatMap((row, at) => rowProblems(row, at, cap, catalogue)),
    ...duplicateProblems(rows, 'id'),
    ...duplicateProblems(rows, 'pattern'),
  ]
}

function fileShapeProblems(file: Raw): string[] {
  return [
    ...(isShare(file.strengthCap) ? [] : ['strengthCap must be above 0 and at most 1']),
    ...(Array.isArray(file.overlays) && file.overlays.length > 0
      ? []
      : ['overlays must be a list of at least one row']),
  ]
}

function rowProblems(row: Raw, at: number, cap: number, catalogue: KindLookCatalogue): string[] {
  const where = `overlays[${at}]`
  return [
    ...(typeof row.id === 'string' && row.id.length > 0 ? [] : [`${where}.id must be a word`]),
    ...patternProblems(row.pattern, where, catalogue),
    ...strengthProblems(row.strength, cap, where),
    ...Object.keys(row)
      .filter((field) => !['id', 'pattern', 'strength'].includes(field))
      .map((field) => `${where} has the unknown field ${field}`),
  ]
}

function patternProblems(pattern: unknown, where: string, catalogue: KindLookCatalogue): string[] {
  const isKnown = catalogue.patterns.some((row) => row.id === pattern)
  return isKnown ? [] : [`${where}.pattern names no pattern of the kind look catalogue`]
}

function strengthProblems(strength: unknown, cap: number, where: string): string[] {
  if (typeof strength !== 'number' || strength === 0 || !Number.isFinite(strength)) {
    return [`${where}.strength must be a signed number other than 0`]
  }
  return Math.abs(strength) <= cap ? [] : [`${where}.strength is over strengthCap ${cap}`]
}

function duplicateProblems(rows: Raw[], field: string): string[] {
  const values = rows.map((row) => row[field])
  return values
    .filter((value, at) => values.indexOf(value) !== at)
    .map((value) => `two overlays share the ${field} ${String(value)}`)
}

function isShare(value: unknown): boolean {
  return typeof value === 'number' && value > 0 && value <= 1
}
