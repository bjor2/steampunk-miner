/**
 * The band tint on the HUD depth gauge (CG2, ticket 830; Progression's row in the GD lock on casing
 * grades by depth: "a faint band tint on the HUD depth gauge"): the depth dial's face takes the
 * plate colour of the casing grade the rig's band needs (`requiredCasingGrade`, decision #41), the
 * same metal the walls of a ring that holds would show, so the dial and the ground agree. The
 * faintness is the dial's CSS; this names the metal. Off a planet, or on its surface with no band,
 * there is no tint.
 */
import { requiredCasingGrade } from '../economy/casingGrades'
import { casingGradeLookOf } from '../render/casingGradeLook'

/** `#rrggbb` of the plate the band needs, or null with no band. */
export function depthBandTintOf(band: number | null): string | null {
  if (band === null || band < 1) return null
  return casingGradeLookOf(requiredCasingGrade(band)).plate.colour
}
