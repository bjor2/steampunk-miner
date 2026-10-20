/**
 * A skin's palette layer (#576, ticket 592): a ramp of three display colours, shadow, body and
 * light, darkest first, that the base and vein cells' luminance indexes. Its body is the hue slot
 * colour of every species wearing it (ticket 450), so a skin keeps the hue guards of the materials
 * table: out of the reserved hue bands and above the brightest host rock.
 */
import { isHexColour, lumaOf, rgbOfHex, type Rgb } from '../../../systems/render/colour'
import type { SkinRow } from './skinLayers'

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
