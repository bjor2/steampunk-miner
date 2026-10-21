import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { formatNdjsonLine } from './ndjson'
import {
  gatedOreValueProblemsOf,
  ORE_VALUE_BARS,
  oreValueReportRowsOf,
  printedOreValueLinesOf,
  type SeedOreCensus,
} from './oreValueBars'
import { censusOfPlanet } from './oreValueCensus'

// R3's ore bars, the GD lock of option (a) on #644 (22 Oct): every fresh planet P1-P10 of each
// census seed is generated whole and its ore pool counted (`oreValueCensus.ts`), then judged on
// `oreValueBars.ts`: generated value at least x1.15 the planet before on P2-P10, ore cells rising
// strictly, ore scarce near the surface and richer with depth. Each step is printed split into its
// radius part and its mix and price part, and the rows `{worldSeed, planet, radius, oreCells,
// oreValue, valueStep, cellStep, radiusPart, mixAndPricePart}` go to
// balance-report/ore-value-census.ndjson. About 20 s a seed on the box, so this is a lane:
//   npx vitest run src/logging/oreValueCensus.lane.test.ts
const RUN_TIMEOUT_MS = 30 * 60 * 1000
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
/**
 * "3 seeds plus the pinned list": the pacing seeds (#84) and the generator golden's other pinned
 * world seed (`generatorGolden.test.ts`), the top of the seed range.
 */
const CENSUS_SEEDS = [...PACING_WORLD_SEEDS['bot-slice'], 4000000000]
const PLANETS = Array.from({ length: ORE_VALUE_BARS.lastPlanet }, (_, at) => at + 1)

describe('the R3 ore pool: P1 to P10 off generation on the census seeds (ticket 644)', () => {
  let censuses: SeedOreCensus[] = []

  beforeAll(() => {
    censuses = CENSUS_SEEDS.map(censusOfSeed)
    console.log(['R3 ore pool:', ...printedOreValueLinesOf(censuses)].join('\n'))
    writeRows(censuses)
  }, RUN_TIMEOUT_MS)

  it('grows the generated ore value x1.15 a planet with rising cells, scarce at the surface and richer with depth', () => {
    expect(gatedOreValueProblemsOf(censuses)).toEqual([])
  })
})

function censusOfSeed(worldSeed: number): SeedOreCensus {
  return {
    worldSeed,
    planets: PLANETS.map((planet) => censusOfPlanet(freshPlanetParamsFor(worldSeed, planet))),
  }
}

function writeRows(seedCensuses: readonly SeedOreCensus[]): void {
  const lines = oreValueReportRowsOf(seedCensuses).map(formatNdjsonLine)
  mkdirSync(REPORT_FOLDER, { recursive: true })
  writeFileSync(new URL('ore-value-census.ndjson', REPORT_FOLDER), lines.join(''))
}
