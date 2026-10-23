/**
 * Where the pacing bot's attrition habit applies (#198, Systems' call on T9 #137): the brass reserve
 * of `botWallet.ts`. It answers P8–P10's deaths per trip, so it starts at planet 8. The death-replay
 * breaker it once shared this start with runs on every planet since ticket 753.
 */

/** #198 acceptance: P8–P10 deaths per trip are judged, P1–P7 stay byte-identical to main. */
const FIRST_ATTRITION_PLANET = 8

export function isAttritionPlanet(planetIndex: number): boolean {
  return planetIndex >= FIRST_ATTRITION_PLANET
}
