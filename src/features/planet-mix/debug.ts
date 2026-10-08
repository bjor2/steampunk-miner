/**
 * Read-only debug actions (feature-slices.md 3.14), so e2e specs, balance probes and
 * `npm run ore:mix` can read a planet's mix without the slice's internals:
 * `steampunkDebug.features['planet-mix'].mixOf(8, 83921)`, `.histogramOf(8, [83921, 31415])`;
 * `.getMagneticLooks()` reads what a magnetic planet draws now (ticket 293), for the e2e state
 * assert: the sky band the kernel shows and the field lines the slice's layer last picked.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { drawnSkyBand } from '../../scene/skyBandPresence'
import { histogramLines, histogramProblems } from './histogramCheck'
import { planetHistogramOf } from './mixHistogram'
import { drawnFieldArcs } from './scene/fieldArcPresence'
import { familyRows } from './systems/familyRows'
import { oreMixFor } from './systems/oreMix'

const NOT_A_PLANET = 'takes a planet index from 1 and world seeds from 0'

function describe() {
  return { ok: true as const, sliceId: 'planet-mix', families: familyRows() }
}

function mixOf(planetIndex: unknown, worldSeed: unknown) {
  if (!isPlanetIndex(planetIndex) || !isWorldSeed(worldSeed)) {
    return { ok: false as const, problems: [`mixOf ${NOT_A_PLANET}`] }
  }
  return { ok: true as const, ...oreMixFor(planetIndex, worldSeed) }
}

/**
 * #141 acceptance 1: the planet generated on each seed, a histogram line per seed and band, and
 * the problems of the seeds pooled against the mix. Generating a whole planet takes seconds.
 */
function histogramOf(planetIndex: unknown, worldSeeds: unknown) {
  const isSeedList = Array.isArray(worldSeeds) && worldSeeds.length > 0
  if (!isPlanetIndex(planetIndex) || !isSeedList || !worldSeeds.every(isWorldSeed)) {
    return { ok: false as const, problems: [`histogramOf ${NOT_A_PLANET}`] }
  }
  const histograms = worldSeeds.map((seed: number) => planetHistogramOf(planetIndex, seed))
  return {
    ok: true as const,
    lines: histograms.flatMap(histogramLines),
    mismatches: histogramProblems(histograms),
  }
}

/** The sky band drawn now (null for none) and the field lines (null with the layer unmounted). */
function getMagneticLooks() {
  const band = drawnSkyBand()
  return {
    ok: true as const,
    skyBand: band === null ? null : { colour: band.look.colour, isRibbonDrawn: band.isRibbonDrawn },
    fieldLines: drawnFieldArcs(),
  }
}

function isPlanetIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1
}

function isWorldSeed(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export const planetMixDebugActions: Readonly<Record<string, DebugAction>> = {
  describe,
  mixOf,
  histogramOf,
  getMagneticLooks,
}
