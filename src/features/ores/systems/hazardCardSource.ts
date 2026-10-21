/**
 * Each planet's hazard on the kernel's planet card (ticket 654, spec #647): the tag and arrival
 * line ticket 651 wrote on the planet's own registry row (`hazardOfPlanet`), keyed by that row as
 * the Horizontal Scaler asked, so planets 2 to 5 each read their own line on arrival and a planet
 * with no hazard row shows none. The source waits on `planet_2`, the shipped travel row open on
 * every planet from 2, since the hazards add no stats.json row. The class cards (`planet-mix`)
 * are untouched.
 */
import type {
  PlanetCardLineAnswer,
  PlanetCardLineSource,
} from '../../../systems/registries/planetCardLines'
import { ORE_ROWS } from './oreRows'
import { hazardOfPlanet } from './planetHazards'

export const HAZARD_CARD_SOURCE: PlanetCardLineSource = {
  id: 'ores.hazard-card',
  featureId: 'planet_2',
  lineOf: (params) => hazardLineOf(params.planetIndex),
}

function hazardLineOf(planetIndex: number): PlanetCardLineAnswer | null {
  const hazard = hazardOfPlanet(ORE_ROWS.planets, planetIndex)
  return hazard === null ? null : { tag: hazard.tag, arrivalLine: hazard.arrivalLine }
}
