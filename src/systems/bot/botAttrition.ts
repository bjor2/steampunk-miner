/**
 * Where the pacing bot's attrition habits apply (#198, Systems' call on T9 #137): the brass reserve
 * of `botWallet.ts` and the death-replay breaker of `botDeathReplay.ts`. They answer P8–P10's deaths
 * per trip, so they start at planet 8, and planets 1 to 7 play byte for byte as before.
 */

/** #198 acceptance: P8–P10 deaths per trip are judged, P1–P7 stay byte-identical to main. */
const FIRST_ATTRITION_PLANET = 8

export function isAttritionPlanet(planetIndex: number): boolean {
  return planetIndex >= FIRST_ATTRITION_PLANET
}
