/**
 * The surface layer's band-1 cap, reported only (ticket 625; the VS confirmation on #625,
 * 6301930425): K(p) grows about 1.68 cells a planet, so somewhere past the campaign the pinned
 * cells and the ramp no longer fit inside band 1 and the ramp is cut to fit, its per-cell step then
 * above 1.5x. The report names the first planet where that happens and lists each capped planet
 * amber with its actual step. Derived from the pure rules alone; nothing here is a run event.
 */
import { SURFACE_REPORT_LAST_PLANET } from '../constants/balance'
import { toFixedText } from '../systems/money'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { isRampCapped, surfaceLayerOf, type SurfaceLayer } from '../systems/world/surfaceLayer'

export interface CappedRamp {
  planet: number
  layer: SurfaceLayer
}

/** The layer reads no seed, only the planet's index, radius and stamp. */
const ANY_WORLD_SEED = 0
const STEP_PLACES = 3

/** The planets from 1 to `lastPlanet` whose ramp the band-1 cap shortened, in order. */
export function cappedRampsThrough(lastPlanet: number): CappedRamp[] {
  return Array.from({ length: lastPlanet }, (_, at) => at + 1).flatMap(cappedRampOn)
}

/** The report's lines: the first planet where the cap binds, then each capped planet amber. */
export function surfaceLayerCapLines(lastPlanet: number = SURFACE_REPORT_LAST_PLANET): string[] {
  const capped = cappedRampsThrough(lastPlanet)
  return [firstCappedLine(capped, lastPlanet), ...capped.map(amberLineOf)]
}

function cappedRampOn(planet: number): CappedRamp[] {
  const layer = surfaceLayerOf(freshPlanetParamsFor(ANY_WORLD_SEED, planet))
  return layer !== null && isRampCapped(layer) ? [{ planet, layer }] : []
}

function firstCappedLine(capped: readonly CappedRamp[], lastPlanet: number): string {
  if (capped.length === 0) return `the band-1 cap binds on no planet through planet ${lastPlanet}`
  return `the band-1 cap first binds on planet ${capped[0].planet}`
}

function amberLineOf({ planet, layer }: CappedRamp): string {
  const step = toFixedText(layer.rampStepRatio, STEP_PLACES)
  const cells = `${layer.rampCells} of ${layer.uncappedRampCells} cells`
  return `planet ${planet} amber: ramp capped at ${cells}, ${step}x a cell`
}
