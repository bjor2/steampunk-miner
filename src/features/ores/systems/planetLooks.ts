/**
 * Each planet's look on its planet registry row (ticket 653, spec #647; the Horizontal Scaler's
 * "one per-planet data row (pool, radius, solar system, look)", and the Game Director's bar that a
 * planet's look shows within a minute of landing): `ores.economy.json` `planets.rows[].look`, on
 * planets 2 to 5 and never on planet 1, which stays as it is drawn today.
 *
 * - `rockSurface`, `rockDeep`: band 1's and band 5's ground (#13; bands 2 to 4 step between), so the
 *   strata maps tint to them as planet 2's did (#51). Neither is brighter than the brightest host
 *   rock of the archetype palettes, the luma every hue slot sits above (#151, materials' guard), so
 *   the ore hue guards hold on every look. A look never touches an ore colour, so ore albedo stays
 *   inside #151's planet-tint caps (hue, chroma and luma unchanged).
 * - `horizon`: the sky behind the surface, fading to the archetype's underground with depth.
 * - `skyBand`: the band of light along the horizon (`planetSkyBand`, #293), drawn in the kernel's
 *   procedural curtains until a ribbon is drawn for it; a planet class's own band wins over it.
 *
 * Planets 2 to 5 differ pairwise: rock surface, horizon and band colour each lie at least 32 of
 * the 255 channel steps apart (`areColoursApart`). The kernel reads a look through the `planetRow` seam
 * (`planetRowProvider.ts`); presentation only, so no stamp, save or digest moves.
 */
import type { PlanetLook } from '../../../systems/registries/planetRow'
import { MIN_SKY_BAND_THICKNESS_M } from '../../../systems/registries/planetSkyBand'
import { paletteOf } from '../../../systems/render/bandPalette'
import { isHexColour, lumaOf, rgbOfHex, type Rgb } from '../../../systems/render/colour'
import { HEAT_PLANET_ARCHETYPE, PLANET_ARCHETYPES } from '../../../systems/world/planetTable'

type Raw = Record<string, unknown>

const ROWS_PATH = 'ore.planets.rows'
const FIRST_LOOK_PLANET = 2
const LAST_REQUIRED_LOOK_PLANET = 5
const LOOK_FIELDS = ['rockSurface', 'rockDeep', 'horizon', 'skyBand']
const BAND_FIELDS = ['colour', 'heightM', 'thicknessM', 'flicker']
/** The colours two planets' looks must not share: an eighth of the channel range apart. */
const LOOKED_COLOURS = ['rockSurface', 'horizon', 'skyBand.colour'] as const
const CHANNEL_MAX = 255
const MIN_LOOK_DISTANCE_CHANNELS = 32
const MIN_LOOK_DISTANCE = MIN_LOOK_DISTANCE_CHANNELS / CHANNEL_MAX
/** A band higher or thicker than this leaves the view the dock shows (#293's aurora: 2 and 5). */
const MAX_BAND_METRES = 10

/** Why the rows' looks are not #653's data; empty when they are. */
export function planetLookProblems(rows: unknown): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const list = rows.map(rawRowOf)
  const shapeProblems = list.flatMap((row, at) => rowLookProblems(row, at))
  return shapeProblems.length > 0 ? shapeProblems : sameLookProblems(list)
}

/** The row's look as the kernel draws it, or null where it has none; only on accepted rows. */
export function planetLookOf(row: Raw): PlanetLook | null {
  const look = row.look as Raw | undefined
  if (look === undefined) return null
  const band = look.skyBand as Raw
  return {
    rockSurface: look.rockSurface as string,
    rockDeep: look.rockDeep as string,
    horizon: look.horizon as string,
    skyBand: {
      colour: band.colour as string,
      heightM: band.heightM as number,
      thicknessM: band.thicknessM as number,
      flicker: band.flicker as number,
      ribbon: null,
    },
  }
}

/**
 * The brightest host rock any archetype palette draws, the luma materials' hue slots sit above:
 * bands mix surface to deep linearly, so their ends bound every band.
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

function rowLookProblems(row: Raw, at: number): string[] {
  const where = `${ROWS_PATH}[${at}].look`
  const planet = at + 1
  if (row.look === undefined) return missingProblems(where, planet)
  if (planet < FIRST_LOOK_PLANET) return [`${where}: planet 1 stays as it is and holds no look`]
  return lookShapeProblems(where, row.look)
}

function missingProblems(where: string, planet: number): string[] {
  const isRequired = planet >= FIRST_LOOK_PLANET && planet <= LAST_REQUIRED_LOOK_PLANET
  return isRequired
    ? [
        `${where} is missing: planets ${FIRST_LOOK_PLANET} to ${LAST_REQUIRED_LOOK_PLANET} each hold one`,
      ]
    : []
}

function lookShapeProblems(where: string, look: unknown): string[] {
  if (!isPlainMap(look)) return [`${where} must be a look row`]
  return [
    ...rockProblems(where, look.rockSurface, 'rockSurface'),
    ...rockProblems(where, look.rockDeep, 'rockDeep'),
    ...(isHexColour(look.horizon) ? [] : [`${where}.horizon must be a #rrggbb colour`]),
    ...bandProblems(`${where}.skyBand`, look.skyBand),
    ...strayFieldProblems(where, look, LOOK_FIELDS, 'look'),
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

/** Each pair of looked planets, each looked colour: too close is the same look. */
function sameLookProblems(rows: readonly Raw[]): string[] {
  const looked = rows
    .map((row, at) => ({ planet: at + 1, look: planetLookOf(row) }))
    .filter((entry): entry is LookedPlanet => entry.look !== null)
  return looked.flatMap((first, at) =>
    looked.slice(at + 1).flatMap((second) => closeColourProblems(first, second)),
  )
}

interface LookedPlanet {
  planet: number
  look: PlanetLook
}

type LookedColour = (typeof LOOKED_COLOURS)[number]

function closeColourProblems(first: LookedPlanet, second: LookedPlanet): string[] {
  return LOOKED_COLOURS.filter((field) => isTooClose(first.look, second.look, field)).map(
    (field) =>
      `${ROWS_PATH}: planets ${first.planet} and ${second.planet} share a look: their ${field} lie under ${MIN_LOOK_DISTANCE_CHANNELS} apart`,
  )
}

function isTooClose(first: PlanetLook, second: PlanetLook, field: LookedColour): boolean {
  return !areColoursApart(lookedColourOf(first, field), lookedColourOf(second, field))
}

function lookedColourOf(look: PlanetLook, field: LookedColour): Rgb {
  if (field === 'skyBand.colour') return rgbOfHex(look.skyBand.colour)
  return rgbOfHex(look[field])
}

function isNumberBetween(value: unknown, lowest: number, highest: number): value is number {
  return typeof value === 'number' && value >= lowest && value <= highest
}

function rawRowOf(row: unknown): Raw {
  return isPlainMap(row) ? row : {}
}

function isPlainMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
