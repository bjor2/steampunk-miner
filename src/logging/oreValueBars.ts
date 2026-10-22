/**
 * R3's ore bars under the radius rule (ticket 644, the GD lock of option (a) on #644, 22 Oct),
 * judged on each seed's generated pool (`oreValueCensus.ts`), since a pool is fixed by its seed and
 * version and needs no median:
 *
 *   gated   the generated ore value at least x1.15 the planet before on P2-P10; the ore cell count
 *           rising strictly on every planet (a step above 1.00, so P6's x1.109 and P10's x1.056
 *           pass); on every planet, ore scarce near the surface (band 1 holds the lowest ore share
 *           of the solid cells) and richer with depth (value per solid cell rising band by band)
 *   printed each step split into its radius part, the area step (R_p / R_p-1)^2, and the rest,
 *           the planet's tier mix and pricier species; and the row of each planet with R(p)
 *
 * A miss is its own ticket and a named exception: the value comes from the pool and the radius,
 * never from ore prices, k or the frozen radius rows (Systems' ruling point 8).
 */
import { div, fromSafeInteger, toCanonical, toFixedText, type Money } from '../systems/money'
import type { BandOreCensus, PlanetOreCensus } from './oreValueCensus'
import { ratioOf } from './radiusRebaselineMedians'

export const ORE_VALUE_BARS = {
  firstStepPlanet: 2,
  lastPlanet: 10,
  // x1.15 spelled as a ratio: the bare decimal is the hold's price ratio in economy.json, and a lane
  // bar decides no play, so it stays out of the economy data (the economy source scan, #535's spelling)
  valueStepMin: 23 / 20,
  cellStepAbove: 1,
} as const

/** One seed's census, a planet each from P1 to the last. */
export interface SeedOreCensus {
  worldSeed: number
  planets: readonly PlanetOreCensus[]
}

/** One planet's step from the planet before, on one seed. */
export interface OreStep {
  planet: number
  valueStep: number
  cellStep: number
  /** The area step (R_p / R_p-1)^2: what the radius alone would give. */
  radiusPart: number
  /** The value step over the radius part: the tier mix and pricier species. */
  mixAndPricePart: number
}

/** Every step of the seed from the first step planet on. */
export function oreStepsOf({ planets }: SeedOreCensus): OreStep[] {
  return planets.flatMap((census, at) => oreStepOf(census, planets[at - 1]))
}

function oreStepOf(census: PlanetOreCensus, before: PlanetOreCensus | undefined): OreStep[] {
  if (before === undefined || census.planet < ORE_VALUE_BARS.firstStepPlanet) return []
  const valueStep = ratioOf(census.oreValue, before.oreValue)
  const radiusPart = (census.radiusTiles / before.radiusTiles) ** 2
  return [
    {
      planet: census.planet,
      valueStep,
      cellStep: census.oreCells / before.oreCells,
      radiusPart,
      mixAndPricePart: valueStep / radiusPart,
    },
  ]
}

/** The bars the census lane gates, as problems; empty when they hold. */
export function gatedOreValueProblemsOf(censuses: readonly SeedOreCensus[]): string[] {
  return censuses.flatMap((census) => [
    ...missingPlanetProblems(census),
    ...oreStepsOf(census).flatMap((step) => valueStepProblems(census.worldSeed, step)),
    ...oreStepsOf(census).flatMap((step) => cellStepProblems(census.worldSeed, step)),
    ...census.planets.flatMap((planet) => surfaceScarcityProblems(census.worldSeed, planet)),
    ...census.planets.flatMap((planet) => depthRichnessProblems(census.worldSeed, planet)),
  ])
}

function missingPlanetProblems({ worldSeed, planets }: SeedOreCensus): string[] {
  if (planets.length === ORE_VALUE_BARS.lastPlanet) return []
  return [
    `seed ${worldSeed} counted ${planets.length} planets, not P1-P${ORE_VALUE_BARS.lastPlanet}`,
  ]
}

function valueStepProblems(worldSeed: number, step: OreStep): string[] {
  if (step.valueStep >= ORE_VALUE_BARS.valueStepMin) return []
  return [
    `seed ${worldSeed} planet ${step.planet} generates x${step.valueStep.toFixed(3)} the ore ` +
      'value of the planet before, under x1.15',
  ]
}

function cellStepProblems(worldSeed: number, step: OreStep): string[] {
  if (step.cellStep > ORE_VALUE_BARS.cellStepAbove) return []
  return [
    `seed ${worldSeed} planet ${step.planet} holds x${step.cellStep.toFixed(3)} the ore cells ` +
      'of the planet before: the count must rise',
  ]
}

/** Band 1 holds the lowest ore share of its solid cells. */
function surfaceScarcityProblems(worldSeed: number, planet: PlanetOreCensus): string[] {
  const [surface, ...deeper] = planet.bands
  const richerSurface = deeper.filter((band) => oreShareOf(band) <= oreShareOf(surface))
  return richerSurface.map(
    (band) =>
      `seed ${worldSeed} planet ${planet.planet} band 1 holds as much ore per solid cell as ` +
      `band ${band.band}: ore must be scarce near the surface`,
  )
}

function oreShareOf(band: BandOreCensus): number {
  return band.solidCells === 0 ? 0 : band.oreCells / band.solidCells
}

/** Value per solid cell rises from each band to the next deeper. */
function depthRichnessProblems(worldSeed: number, planet: PlanetOreCensus): string[] {
  return planet.bands
    .filter((band, at) => at > 0 && !isRicherThan(band, planet.bands[at - 1]))
    .map(
      (band) =>
        `seed ${worldSeed} planet ${planet.planet} band ${band.band} is no richer per solid ` +
        `cell than band ${band.band - 1}: ore must grow richer with depth`,
    )
}

function isRicherThan(deeper: BandOreCensus, above: BandOreCensus): boolean {
  if (deeper.solidCells === 0 || above.solidCells === 0) return true
  return ratioOf(valuePerSolidCellOf(deeper), valuePerSolidCellOf(above)) > 1
}

function valuePerSolidCellOf(band: BandOreCensus): Money {
  return div(band.oreValue, fromSafeInteger(band.solidCells))
}

/** The lines the census lane prints and never gates. */
export function printedOreValueLinesOf(censuses: readonly SeedOreCensus[]): string[] {
  return censuses.flatMap((census) => [
    ...census.planets.map((planet) => planetRowLine(census.worldSeed, planet)),
    ...oreStepsOf(census).map((step) => stepSplitLine(census.worldSeed, step)),
  ])
}

function planetRowLine(worldSeed: number, planet: PlanetOreCensus): string {
  return (
    `seed ${worldSeed} planet ${planet.planet}: R ${planet.radiusTiles}, ` +
    `${planet.oreCells} ore cells, generated value ${toFixedText(planet.oreValue, 0)}`
  )
}

function stepSplitLine(worldSeed: number, step: OreStep): string {
  return (
    `seed ${worldSeed} planet ${step.planet}: value x${step.valueStep.toFixed(3)} = radius ` +
    `x${step.radiusPart.toFixed(3)} * mix and price x${step.mixAndPricePart.toFixed(3)}, ` +
    `cells x${step.cellStep.toFixed(3)}`
  )
}

/** One report row of the census: the planet's R(p), its pool and the measured step into it. */
export interface OreValueReportRow {
  worldSeed: number
  planet: number
  radius: number
  oreCells: number
  /** Canonical money text (decision #5). */
  oreValue: string
  valueStep: string | null
  cellStep: string | null
  radiusPart: string | null
  mixAndPricePart: string | null
}

/** A row a seed and planet, for `balance-report/ore-value-census.ndjson`. */
export function oreValueReportRowsOf(censuses: readonly SeedOreCensus[]): OreValueReportRow[] {
  return censuses.flatMap((census) => {
    const steps = oreStepsOf(census)
    return census.planets.map((planet) =>
      reportRowOf(
        census.worldSeed,
        planet,
        steps.find((step) => step.planet === planet.planet),
      ),
    )
  })
}

function reportRowOf(
  worldSeed: number,
  planet: PlanetOreCensus,
  step: OreStep | undefined,
): OreValueReportRow {
  return {
    worldSeed,
    planet: planet.planet,
    radius: planet.radiusTiles,
    oreCells: planet.oreCells,
    oreValue: toCanonical(planet.oreValue),
    valueStep: step?.valueStep.toFixed(3) ?? null,
    cellStep: step?.cellStep.toFixed(3) ?? null,
    radiusPart: step?.radiusPart.toFixed(3) ?? null,
    mixAndPricePart: step?.mixAndPricePart.toFixed(3) ?? null,
  }
}
