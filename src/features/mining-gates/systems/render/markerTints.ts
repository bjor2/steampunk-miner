/**
 * A signature cell's marker tint (ticket 238: "Signature markers are tinted by the #151 act
 * theme"): the act's rim colour from #151's per-theme palette, or the act's secondary when
 * - the rim's hue lies within `hueCollisionDeg` of the ore family's hue (#151's hue-collision
 *   rule: Frost's blue rim on cyan crystal turns silver), or
 * - the rim's hue lies in the reserved heat hues (#151 "Reserved colours": warm orange belongs to
 *   lava and heat; #142: the extractor marker has no orange).
 * The tint moves the marker only, never the ore's family, tier or role colours.
 */
import { actOf } from '../../../planet-mix'
import { ORE_LOOKS, oreFamilyLookOf } from '../../../ore-visuals'
import LOCK_MARKERS_FILE from '../../lockMarkers.json'

export interface ActTint {
  /** `#rrggbb`. */
  rim: string
  secondary: string
}

const ACT_TINTS: Readonly<Record<string, ActTint>> = LOCK_MARKERS_FILE.actTints
const HUE_COLLISION_DEG = LOCK_MARKERS_FILE.hueCollisionDeg
const [RESERVED_HUE_FROM, RESERVED_HUE_TO] = LOCK_MARKERS_FILE.reservedHueBand
const FULL_TURN_DEG = 360
const HUE_SIXTH_DEG = 60

/** The tint of a signature marker of `family` on planet `planetIndex`; null for an act with none. */
export function signatureTintOf(planetIndex: number, family: string): string | null {
  const tint = actTintOf(actOf(planetIndex).id)
  if (tint === null) return null
  return needsSecondary(hueOfHex(tint.rim), family) ? tint.secondary : tint.rim
}

/** The act's tint row, or null for an act the palette does not name. */
export function actTintOf(actId: string): ActTint | null {
  return ACT_TINTS[actId] ?? null
}

/** Whether `hueDeg` lies in the reserved heat hues. */
export function isReservedHue(hueDeg: number): boolean {
  return hueDeg >= RESERVED_HUE_FROM && hueDeg <= RESERVED_HUE_TO
}

/** The hue of `#rrggbb` in degrees, 0 up to 360; a grey reads 0. */
export function hueOfHex(hex: string): number {
  const [red, green, blue] = channelsOf(hex)
  const high = Math.max(red, green, blue)
  const spread = high - Math.min(red, green, blue)
  if (spread === 0) return 0
  const sixths = sixthsOf(high, spread, red, green, blue)
  return (sixths * HUE_SIXTH_DEG + FULL_TURN_DEG) % FULL_TURN_DEG
}

function needsSecondary(rimHue: number, family: string): boolean {
  return isReservedHue(rimHue) || isNearFamilyHue(rimHue, family)
}

function isNearFamilyHue(rimHue: number, family: string): boolean {
  const band = oreFamilyLookOf(ORE_LOOKS, family)?.hueBand
  if (band === undefined) return false
  return hueDistanceOf(rimHue, (band[0] + band[1]) / 2) < HUE_COLLISION_DEG
}

function hueDistanceOf(a: number, b: number): number {
  const apart = Math.abs(a - b) % FULL_TURN_DEG
  return Math.min(apart, FULL_TURN_DEG - apart)
}

/** The standard RGB-to-hue step: which channel is highest picks the sixth of the wheel. */
function sixthsOf(high: number, spread: number, red: number, green: number, blue: number) {
  if (high === red) return (green - blue) / spread
  if (high === green) return (blue - red) / spread + 2
  return (red - green) / spread + 4
}

function channelsOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}
