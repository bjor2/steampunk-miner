/**
 * What a merchant frontage wears (ticket 825): the planet's horizon colour from the registry row
 * the star map card and the ground read (ticket 653), else its archetype palette's sky (#13), so
 * the dock and the card agree and no frontage has a colour of its own. Look maths only.
 */
import { planetLookOf } from '../../../../systems/registries/planetRow'
import { paletteOf } from '../../../../systems/render/bandPalette'
import { hexOfRgb } from '../../../../systems/render/colour'
import { planetArchetypeOf } from '../../../../systems/world/planetArchetype'
import type { PlanetId } from '../../../solar-systems'
import { campaignIndexOf } from '../planetKitSales'

/** The `#rrggbb` a planet's frontage, awning and banner alike, is painted in. */
export function merchantCanvasColourOf(planet: PlanetId): string {
  const planetIndex = Number(campaignIndexOf(planet))
  const look = planetLookOf(planetIndex)
  if (look !== null) return look.horizon
  return hexOfRgb(paletteOf(planetArchetypeOf(planetIndex).paletteId).sky)
}
