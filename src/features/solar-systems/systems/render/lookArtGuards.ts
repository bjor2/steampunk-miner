/**
 * Why the look art rows are not ticket 778's (`lookArt.ts`); empty when they are. The guards are
 * ticket 653's for a planet row's look, mirrored here because a slice reads another slice only
 * through its index (`src/features/ores/systems/planetLooks.ts` names the same bounds): every look
 * of the palette has one row and no row names a look the palette lacks; each colour is a display
 * `#rrggbb`; no rock is brighter than the brightest archetype host rock, the luma every materials
 * hue slot sits above (#151); the band keeps the view the dock shows; and any two looks' rock
 * surface, horizon and band colour lie at least 32 of the 255 channel steps apart, so the looks
 * read apart in hue as their motifs do in pattern (the lock's acceptance 3).
 */
import { MIN_SKY_BAND_THICKNESS_M } from '../../../../systems/registries/planetSkyBand'
import { paletteOf } from '../../../../systems/render/bandPalette'
import { isHexColour, lumaOf, rgbOfHex, type Rgb } from '../../../../systems/render/colour'
import { HEAT_PLANET_ARCHETYPE, PLANET_ARCHETYPES } from '../../../../systems/world/planetTable'

type Raw = Record<string, unknown>

const LOOK_FIELDS = ['rockSurface', 'rockDeep', 'horizon', 'skyBand']
const BAND_FIELDS = ['colour', 'heightM', 'thicknessM', 'flicker']
/** The colours two looks must not share: an eighth of the channel range apart (ticket 653). */
const LOOKED_COLOURS = ['rockSurface', 'horizon', 'skyBand.colour'] as const
const CHANNEL_MAX = 255
export const MIN_LOOK_DISTANCE_CHANNELS = 32
const MIN_LOOK_DISTANCE = MIN_LOOK_DISTANCE_CHANNELS / CHANNEL_MAX
/** A band higher or thicker than this leaves the view the dock shows (#293's aurora: 2 and 5). */
const MAX_BAND_METRES = 10

export function lookArtProblems(rows: unknown, lookIds: readonly string[]): string[] {
  const raw = asMap(rows)
  const coverage = coverageProblems(Object.keys(raw), lookIds)
  const shape = Object.entries(raw).flatMap(([lookId, row]) => rowProblems(lookId, row))
  return [...coverage, ...shape, ...(shape.length === 0 ? apartProblems(raw) : [])]
}

/**
 * The brightest host rock any archetype palette draws, the luma materials' hue slots sit above:
 * bands mix surface to deep linearly, so their ends bound every band (ticket 653).
 */
export function brightestArchetypeRockLuma(): number {
  return Math.max(
    ...[...PLANET_ARCHETYPES, HEAT_PLANET_ARCHETYPE]
      .map((archetype) => paletteOf(archetype.paletteId))
      .flatMap((palette) => [lumaOf(palette.surface), lumaOf(palette.deep)]),
  )
}

/** Whether two display colours lie at least an eighth of the channel range apart (Euclidean). */
export function areColoursApart(from: Rgb, to: Rgb): boolean {
  const [red, green, blue] = [from[0] - to[0], from[1] - to[1], from[2] - to[2]]
  return red * red + green * green + blue * blue >= MIN_LOOK_DISTANCE * MIN_LOOK_DISTANCE
}

function coverageProblems(named: readonly string[], lookIds: readonly string[]): string[] {
  return [
    ...lookIds.filter((id) => !named.includes(id)).map((id) => `looks.${id} has no art row`),
    ...named
      .filter((id) => !lookIds.includes(id))
      .map((id) => `looks.${id} is no look of the palette`),
  ]
}

function rowProblems(lookId: string, row: unknown): string[] {
  const where = `looks.${lookId}`
  if (!isPlainMap(row)) return [`${where} must be a look row`]
  return [
    ...rockProblems(where, row.rockSurface, 'rockSurface'),
    ...rockProblems(where, row.rockDeep, 'rockDeep'),
    ...(isHexColour(row.horizon) ? [] : [`${where}.horizon must be a #rrggbb colour`]),
    ...bandProblems(`${where}.skyBand`, row.skyBand),
    ...strayFieldProblems(where, row, LOOK_FIELDS, 'look'),
  ]
}

function rockProblems(where: string, rock: unknown, field: string): string[] {
  if (!isHexColour(rock)) return [`${where}.${field} must be a #rrggbb colour`]
  const ceiling = brightestArchetypeRockLuma()
  return lumaOf(rgbOfHex(rock)) <= ceiling
    ? []
    : [`${where}.${field} is brighter than the host rock's ${ceiling.toFixed(3)}`]
}

function bandProblems(where: string, band: unknown): string[] {
  if (!isPlainMap(band)) return [`${where} must be a band row`]
  return [
    ...(isHexColour(band.colour) ? [] : [`${where}.colour must be a #rrggbb colour`]),
    ...(isNumberBetween(band.heightM, 0, MAX_BAND_METRES)
      ? []
      : [`${where}.heightM must be metres from 0 to ${MAX_BAND_METRES}`]),
    ...(isNumberBetween(band.thicknessM, MIN_SKY_BAND_THICKNESS_M, MAX_BAND_METRES)
      ? []
      : [
          `${where}.thicknessM must be metres from ${MIN_SKY_BAND_THICKNESS_M} to ${MAX_BAND_METRES}`,
        ]),
    ...(isNumberBetween(band.flicker, 0, 1) ? [] : [`${where}.flicker must be from 0 to 1`]),
    ...strayFieldProblems(where, band, BAND_FIELDS, 'band'),
  ]
}

function strayFieldProblems(where: string, row: Raw, fields: string[], noun: string): string[] {
  return Object.keys(row)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where}.${field} is not a ${noun} field`)
}

/** Each pair of looks, each looked colour: too close is the same look. */
function apartProblems(rows: Raw): string[] {
  const ids = Object.keys(rows)
  return ids.flatMap((first, at) =>
    ids.slice(at + 1).flatMap((second) => closeColourProblems(rows, first, second)),
  )
}

type LookedColour = (typeof LOOKED_COLOURS)[number]

function closeColourProblems(rows: Raw, first: string, second: string): string[] {
  return LOOKED_COLOURS.filter(
    (field) =>
      !areColoursApart(lookedColourOf(rows, first, field), lookedColourOf(rows, second, field)),
  ).map(
    (field) =>
      `looks: ${first} and ${second} share a look: their ${field} lie under ${MIN_LOOK_DISTANCE_CHANNELS} apart`,
  )
}

function lookedColourOf(rows: Raw, lookId: string, field: LookedColour): Rgb {
  const row = rows[lookId] as Raw
  if (field === 'skyBand.colour') return rgbOfHex((row.skyBand as Raw).colour as string)
  return rgbOfHex(row[field] as string)
}

function isNumberBetween(value: unknown, lowest: number, highest: number): value is number {
  return typeof value === 'number' && value >= lowest && value <= highest
}

function isPlainMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asMap(value: unknown): Raw {
  return isPlainMap(value) ? value : {}
}
