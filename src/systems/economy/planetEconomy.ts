/**
 * Planet-level economy numbers (decisions #6 section 2 and 6, #10): the core fragments travel
 * needs and the `paceScale(p)` price lever.
 */
import { ceil, fromSafeInteger, mul, toSafeInteger, type Money } from '../money'
import { ECONOMY } from './economy'

const { planets } = ECONOMY

/** `coreNeeded = ceil(0.4 * coreTileCount)`: 63 on planet 1, 127 from planet 2 on (#10). */
export function coreFragmentsNeeded(coreTileCount: number): number {
  return toSafeInteger(ceil(mul(planets.coreFraction, fromSafeInteger(coreTileCount))))
}

/** Fragments one core tile drops (#10 `fragmentsPerTile`, a data field). */
export function fragmentsPerCoreTile(): number {
  return planets.fragmentsPerTile
}

/**
 * The balance regression's lever (#6 section 6): every charge on planet `p` is multiplied by it.
 * A single planet's scale wins, then the last `fromPlanet` step at or below `p` (#131), then the
 * default "1", so no formula changes when it is retuned.
 */
export function paceScale(planetIndex: number): Money {
  return (
    planets.paceScale.byPlanet.get(planetIndex) ??
    stepScaleAt(planetIndex) ??
    planets.paceScale.default
  )
}

function stepScaleAt(planetIndex: number): Money | undefined {
  return planets.paceScale.fromPlanet.filter((step) => step.from <= planetIndex).at(-1)?.scale
}
