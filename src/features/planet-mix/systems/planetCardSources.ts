/**
 * The planet classes' lines on the kernel's planet card (ticket 343, GD ruling on #293 Q2): one
 * source per class with card text in `planetCards.json`, each waiting on its class's schedule row,
 * so the kernel shows a class's tag only once that row is open (magnetic from P25; frozen, hollow
 * and relic are vision rows and stay silent whatever text they get). The text is
 * `planetClassCardOf`'s, the hazard alone: no gate kind is named for a class yet.
 */
import type {
  PlanetCardLineAnswer,
  PlanetCardLineSource,
} from '../../../systems/registries/planetCardLines'
import { planetClassCardOf, PLANET_CLASS_CARDS } from './planetCard'
import type { PlanetClass } from './planetClassRows'

/** Each class's row in docs/scaling/horizontal/stats.json (Schedule C, #80). */
const CLASS_SCHEDULE_ROWS: Readonly<Record<PlanetClass, string>> = {
  frozen: 'frozen_planets',
  magnetic: 'magnetic_planets',
  hollow: 'hollow_planets',
  relic: 'relic_planet',
}

/** A source for every class that has card text, in class order. */
export function planetCardSources(): readonly PlanetCardLineSource[] {
  return classesWithCards().map(sourceOfClass)
}

function classesWithCards(): PlanetClass[] {
  return (Object.keys(CLASS_SCHEDULE_ROWS) as PlanetClass[]).filter(
    (planetClass) => PLANET_CLASS_CARDS[planetClass] !== undefined,
  )
}

function sourceOfClass(planetClass: PlanetClass): PlanetCardLineSource {
  return {
    id: `planet-mix.card-${planetClass}`,
    featureId: CLASS_SCHEDULE_ROWS[planetClass],
    lineOf: (params) => lineOfClass(planetClass, params.planetIndex),
  }
}

function lineOfClass(planetClass: PlanetClass, planetIndex: number): PlanetCardLineAnswer | null {
  const card = planetClassCardOf(planetIndex)
  return card?.planetClass === planetClass ? { tag: card.tag, arrivalLine: card.arrivalLine } : null
}
