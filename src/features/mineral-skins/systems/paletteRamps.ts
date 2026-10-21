/**
 * A skin's palette layer (#576, ticket 592): a ramp of three display colours, shadow, body and
 * light, darkest first, that the base and vein cells' luminance indexes. Its body is the hue slot
 * colour of every species wearing it (ticket 450), so a skin keeps the hue guards of the materials
 * table: out of the reserved hue bands and above the brightest host rock. A planet's signature
 * material has no hue slot (#453 E1), so a signature palette's body keeps inside the hue and luma
 * bands of its family's #151 look instead (ticket 603), which hold the same two guards.
 */
import { isHexColour, lumaOf, rgbOfHex, type Rgb } from '../../../systems/render/colour'
import type { SignatureMaterial } from './signatureMaterial'
import type { SignatureSkinRow, SkinRow } from './skinLayers'

export type PaletteRamp = readonly [shadow: string, body: string, light: string]

const RAMP_LENGTH = 3
/** A hex channel rounds to the nearest 1/255, so the body may sit half a step off the slot colour. */
const BODY_TOLERANCE = 0.5 / 255 + 1e-9

export function rampShapeProblems(ramp: unknown, where: string): string[] {
  if (!isRampOfHexColours(ramp)) return [`${where} must be three #rrggbb colours`]
  return isDarkestFirst(ramp) ? [] : [`${where} must run darkest first, shadow, body, light`]
}

/** Why a skin's palette would paint its species off its hue slot; empty when every body matches. */
export function rampBodyProblems(
  skins: readonly SkinRow[],
  ramps: ReadonlyMap<string, PaletteRamp>,
  hueColourBySpecies: ReadonlyMap<string, Rgb>,
): string[] {
  return skins
    .filter((skin) => isOffHueSlot(ramps.get(skin.palette), hueColourBySpecies.get(skin.species)))
    .map(
      (skin) =>
        `${skin.species} wears the palette ${skin.palette}, whose body is not its hue slot colour`,
    )
}

/** Why a signature palette would paint its material off its family's look; empty when none. */
export function signatureBodyProblems(
  rows: readonly SignatureSkinRow[],
  ramps: ReadonlyMap<string, PaletteRamp>,
  signatureByPlanet: ReadonlyMap<number, SignatureMaterial>,
): string[] {
  return rows
    .filter((row) => isOffFamilyLook(ramps.get(row.palette), signatureByPlanet.get(row.planet)))
    .map(
      (row) =>
        `the signature of planet ${row.planet} wears the palette ${row.palette}, whose body is outside its family's hue or luma band`,
    )
}

function isRampOfHexColours(ramp: unknown): ramp is PaletteRamp {
  return Array.isArray(ramp) && ramp.length === RAMP_LENGTH && ramp.every(isHexColour)
}

function isDarkestFirst(ramp: PaletteRamp): boolean {
  const [shadow, body, light] = ramp.map((hex) => lumaOf(rgbOfHex(hex)))
  return shadow < body && body < light
}

/** Only a ramp and a species both known are measured; the table names the unknown ones. */
function isOffHueSlot(ramp: PaletteRamp | undefined, hueColour: Rgb | undefined): boolean {
  if (ramp === undefined || hueColour === undefined) return false
  const body = rgbOfHex(ramp[1])
  return body.some((channel, at) => Math.abs(channel - hueColour[at]) > BODY_TOLERANCE)
}

/** As for a hue slot, only a known ramp and material are measured. */
function isOffFamilyLook(
  ramp: PaletteRamp | undefined,
  material: SignatureMaterial | undefined,
): boolean {
  if (ramp === undefined || material === undefined) return false
  const body = rgbOfHex(ramp[1])
  return !isWithin(hueDegOf(body), material.hueBand) || !isWithin(lumaOf(body), material.lumaBand)
}

function isWithin(value: number, [low, high]: readonly [number, number]): boolean {
  return value >= low && value <= high
}

/** The HSV hue in degrees, 0 for a grey. */
function hueDegOf([r, g, b]: Rgb): number {
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)]
  if (max === min) return 0
  const span = max - min
  const sextant = max === r ? (g - b) / span : max === g ? (b - r) / span + 2 : (r - g) / span + 4
  return (sextant * 60 + 360) % 360
}
