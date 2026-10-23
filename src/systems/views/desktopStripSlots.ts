/**
 * The desktop strip's extra slots (spec #678, ticket 767, GD lock 23 Oct): a wide HUD adds space,
 * not digits (VS), so desktop keeps two wells on the strip for the star map's fuel (#650): the fuel
 * tank's dial and the next hop's fuel cost, held at the width of the shared formatter's widest
 * figure (#681, 6 chars) so neither moves the strip when the fuel state (#755) and its curve (#756)
 * fill them. Until then they are empty and keep their width. The depth number takes the cool tint
 * of the tile readout (#724) while the gravity ramp holds the cut down, so the limit shows without
 * opening the detail. A phone gets none of it: its strip stays as it was. Pure.
 */
import { DESIGN_TOKENS, type DesignTokens, type LayoutKind } from './designSystem'
import type { HudModel } from './hudModel'

export interface DesktopStripSlots {
  /** The characters the fuel cost's well keeps room for: the formatter's widest. */
  fuelCostChars: number
  /** The gravity ramp holds the cut down this step (#724): the depth number is tinted. */
  isDescentGravityLimited: boolean
}

export function desktopStripSlotsOf(
  model: HudModel,
  kind: LayoutKind,
  tokens: DesignTokens = DESIGN_TOKENS,
): DesktopStripSlots | null {
  if (kind === 'phone') return null
  return {
    fuelCostChars: tokens.numbers.maxChars,
    isDescentGravityLimited: model.tileTime.state === 'gravity',
  }
}
