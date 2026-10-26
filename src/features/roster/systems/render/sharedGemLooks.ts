/**
 * The HS's row 3 on ticket 890 (GD lock of 26 Oct): no two planets of one act share a gem look. A
 * planet's gem look is its gems' library cuts and hues under the overlay the planet lays over them;
 * two planets share one when a gem of each wears the same cut under the same overlay in colours less
 * than 32 channel steps apart (ticket 653's minimum, `areColoursApart` in the `ores` slice's
 * `planetLooks.ts`). The act is the planet's look group (the GD lock: system 1's act run from P6, a
 * later system whole), the group the overlay walk keeps apart from ore rules 15. Pure.
 */
import { rgbOfHex, type Rgb } from '../../../../systems/render/colour'

/** Ticket 653's minimum distance between two display colours, in channel steps of 255. */
const MIN_GEM_LOOK_STEPS = 32
const CHANNEL_MAX = 255

export interface PlanetGemLook {
  /** `<s>.<p>`, as the problems name the planet. */
  label: string
  /** The planet's look group, as one key: two planets of one key are of one act. */
  group: string
  /** The overlay id the planet lays over its cuts; null where it draws none. */
  overlay: string | null
  gems: readonly GemLook[]
}

export interface GemLook {
  cut: string
  /** `#rrggbb`, the hue as the shader reads it back. */
  colour: string
}

/** Each pair of planets of one group that share a gem look, as `<a> and <b> share <cut>`. */
export function sharedGemLooksOf(planets: readonly PlanetGemLook[]): string[] {
  return planets.flatMap((planet, at) =>
    planets
      .slice(at + 1)
      .filter((other) => other.group === planet.group)
      .flatMap((other) => sharedLookOf(planet, other)),
  )
}

function sharedLookOf(planet: PlanetGemLook, other: PlanetGemLook): string[] {
  if (planet.overlay === null || planet.overlay !== other.overlay) return []
  const shared = planet.gems.find((gem) => other.gems.some((twin) => isSameGemLook(gem, twin)))
  if (shared === undefined) return []
  return [`${planet.label} and ${other.label} share ${shared.cut} under ${planet.overlay}`]
}

function isSameGemLook(gem: GemLook, other: GemLook): boolean {
  return (
    gem.cut === other.cut &&
    stepsApartOf(rgbOfHex(gem.colour), rgbOfHex(other.colour)) < MIN_GEM_LOOK_STEPS
  )
}

/** The Euclidean distance of two colours in channel steps. */
function stepsApartOf(from: Rgb, to: Rgb): number {
  const [red, green, blue] = [from[0] - to[0], from[1] - to[1], from[2] - to[2]]
  return Math.sqrt(red * red + green * green + blue * blue) * CHANNEL_MAX
}
