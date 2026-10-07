/**
 * How far past the curve the vehicle entered and left each planet on the two drill tracks (C3 #86,
 * Systems & Economy): the bot holds `drill_power` to one level past the planet's on-curve level and
 * the forced core rule buys `drill_tip` to two past. On arrival the levels are measured against the
 * planet left behind (its on-curve level is what the vehicle should have left it with), at
 * departure against the planet itself. Printed beside each seed's band-5 ratio; reported only.
 */
import type { UpgradeId } from '../systems/economy/economyDefinition'
import { majorOf } from '../systems/economy/upgradeSteps'
import { onCurveLevel } from '../systems/economy/vehicleStats'
import type { LoggedLevels, PlanetLevels } from './bandDigReport'

const FIRST_PLANET = 1

/** `drill +1/+1, tip -1/+2` for the planet; empty for planet 1, which has no planet before it. */
export function drillLeadsText(levels: PlanetLevels, planet: string): string {
  const planetIndex = Number.parseInt(planet)
  if (planetIndex === FIRST_PLANET) return ''
  const arrival = levels.arrival[planet] ?? {}
  const departure = levels.departure[planet] ?? arrival
  const lead = (track: UpgradeId) =>
    `${signed(leadOf(arrival, track, planetIndex - 1))}/${signed(leadOf(departure, track, planetIndex))}`
  return `drill ${lead('drill_power')}, tip ${lead('drill_tip')}`
}

/** In major levels: the logged levels are steps (#180), the lead caps count majors. */
function leadOf(levels: LoggedLevels, track: UpgradeId, onCurvePlanet: number): number {
  return majorOf(levels[track] ?? 0) - onCurveLevel(track, onCurvePlanet)
}

function signed(lead: number): string {
  return lead > 0 ? `+${lead}` : String(lead)
}
