/**
 * The surface layer against band 1, reported only (ticket 625; GD lock R2 on #302, 6306854642,
 * ticket 643): K(p) grows about 1.68 cells a planet while the layer stays in whole cells at any
 * radius, so somewhere past the campaign the pinned cells and the ramp reach deeper than band 1. On
 * a planet at its registry row's solved radius the ramp is never shortened and runs past band 1; on
 * #6's ladder it is cut to fit, its step then above 1.5x. The report names the first planet where
 * the ramp reaches past band 1 and lists each such planet amber. Derived from the pure rules alone;
 * nothing here is a run event.
 */
import { SURFACE_REPORT_LAST_PLANET } from '../constants/balance'
import { toFixedText } from '../systems/money'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import {
  isRampCapped,
  isRampPastBandOne,
  surfaceLayerOf,
  type SurfaceLayer,
} from '../systems/world/surfaceLayer'

export interface RampPastBandOne {
  planet: number
  layer: SurfaceLayer
}

/** The layer reads no seed, only the planet's index, radius and stamp. */
const ANY_WORLD_SEED = 0
const STEP_PLACES = 3

/** The planets from 1 to `lastPlanet`, entered fresh, whose ramp reaches past band 1, in order. */
export function rampsPastBandOneThrough(lastPlanet: number): RampPastBandOne[] {
  return Array.from({ length: lastPlanet }, (_, at) => at + 1).flatMap(rampPastBandOneOn)
}

/** The report's lines: the first planet where the ramp reaches past band 1, then each one amber. */
export function surfaceLayerBandOneLines(
  lastPlanet: number = SURFACE_REPORT_LAST_PLANET,
): string[] {
  const past = rampsPastBandOneThrough(lastPlanet)
  return [firstPastLine(past, lastPlanet), ...past.map(amberLineOf)]
}

function rampPastBandOneOn(planet: number): RampPastBandOne[] {
  const layer = surfaceLayerOf(freshPlanetParamsFor(ANY_WORLD_SEED, planet))
  return layer !== null && isRampPastBandOne(layer) ? [{ planet, layer }] : []
}

function firstPastLine(past: readonly RampPastBandOne[], lastPlanet: number): string {
  if (past.length === 0) return `the ramp stays inside band 1 on every planet to ${lastPlanet}`
  return `the ramp first reaches past band 1 on planet ${past[0].planet}`
}

function amberLineOf({ planet, layer }: RampPastBandOne): string {
  const step = toFixedText(layer.rampStepRatio, STEP_PLACES)
  return `planet ${planet} amber: ${rampTextOf(layer)}, ${step}x a cell`
}

/** Cut to fit band 1 on #6's ladder; uncut, past it, at a registry row's solved radius. */
function rampTextOf(layer: SurfaceLayer): string {
  return isRampCapped(layer) ? cutRampOf(layer) : uncutRampOf(layer)
}

function cutRampOf(layer: SurfaceLayer): string {
  return `ramp capped at ${layer.rampCells} of ${layer.uncappedRampCells} cells`
}

function uncutRampOf(layer: SurfaceLayer): string {
  const layerCells = layer.pinnedCells + layer.rampCells
  return `layer ${layerCells} cells, ${layerCells - layer.bandOneCells} past band 1`
}
