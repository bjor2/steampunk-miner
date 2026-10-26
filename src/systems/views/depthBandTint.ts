/**
 * The band tint on the HUD depth gauge (CG2, ticket 830; Progression's row in the GD lock on casing
 * grades by depth: "a faint band tint on the HUD depth gauge"): the depth dial's face takes the
 * plate colour of the highest casing grade the rig's band needs (`requiredCasingGrade`, ticket
 * 829's ladder), the same metal the walls of a ring that holds would show, so the dial and the
 * ground agree. The faintness is the dial's CSS; this names the metal. Off a planet, or on its
 * surface with no band, there is no tint.
 */
import { casingGradeLookOf, casingLookGradeOf } from '../render/casingGradeLook'

/** `#rrggbb` of the plate of the grade the band needs, or null with none. */
export function depthBandTintOf(neededGrade: bigint | null): string | null {
  if (neededGrade === null) return null
  return casingGradeLookOf(casingLookGradeOf(neededGrade)).plate.colour
}
