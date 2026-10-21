import { describe, expect, it } from 'vitest'
import { oreSalePrice } from '../systems/economy/oreEconomy'
import {
  add,
  fromFiniteNumber,
  fromSafeInteger,
  mul,
  toCanonical,
  ZERO_MONEY,
} from '../systems/money'
import { bandOfTile } from '../systems/world/planetGeometry'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { CHUNK_CELLS, CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../systems/world/tileGrid'
import {
  AIR_CELL,
  CORE_CELL,
  GROUND_CELL,
  oreCell,
  RESOURCE_FAMILY,
  SPACE_CELL,
} from '../systems/world/worldCell'
import {
  gatedOreValueProblemsOf,
  oreStepsOf,
  oreValueReportRowsOf,
  printedOreValueLinesOf,
  type SeedOreCensus,
} from './oreValueBars'
import {
  censusOfCounts,
  countChunkOre,
  emptyOreCount,
  type BandOreCensus,
  type PlanetOreCensus,
} from './oreValueCensus'

const SEED = 83921

describe('ore value census (ticket 644)', () => {
  it('counts the ore cells of a chunk at their base sale price, beside the solid cells of their band', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    const surfaceRow = params.radiusTiles - 1
    const cy = chunkOfTile(surfaceRow)
    const rowIndex = (surfaceRow - 2 - firstTileOfChunk(cy)) * CHUNK_SIZE
    const cells = new Uint32Array(CHUNK_CELLS).fill(SPACE_CELL)
    cells[rowIndex] = oreCell(RESOURCE_FAMILY.metal, 0)
    cells[rowIndex + 1] = oreCell(RESOURCE_FAMILY.metal, 0)
    cells[rowIndex + 2] = GROUND_CELL
    cells[rowIndex + 3] = AIR_CELL
    cells[rowIndex + 4] = CORE_CELL

    const count = emptyOreCount(params)
    countChunkOre(count, params, 0, cy, cells)
    const census = censusOfCounts(count)

    expect(bandOfTile(params, 0, surfaceRow - 2)).toBe(1)
    expect(census.oreCells).toBe(2)
    expect(census.bands[0]).toMatchObject({ band: 1, solidCells: 3, oreCells: 2 })
    expect(toCanonical(census.oreValue)).toBe(toCanonical(mul(oreSalePrice(1), fromSafeInteger(2))))
    expect(census.bands.slice(1).every((band) => band.solidCells === 0)).toBe(true)
  })
})

describe('ore value bars (ticket 644)', () => {
  it('passes seeds whose value steps x1.15 or more, cells rise and ore grows richer with depth', () => {
    expect(gatedOreValueProblemsOf([seedOf(SEED, onBars)])).toEqual([])
  })

  it('fails a planet whose generated value grows less than x1.15, whatever its cells do', () => {
    const problems = gatedOreValueProblemsOf([
      seedOf(SEED, (planet) => ({ ...onBars(planet), pricePerCell: planet === 6 ? 1.0 : 1.2 })),
    ])
    expect(problems).toEqual([
      `seed ${SEED} planet 6 generates x1.100 the ore value of the planet before, under x1.15`,
    ])
  })

  it('passes a cell step just above 1.00 and fails one that does not rise', () => {
    const slowCells = seedOf(SEED, (planet) => ({ ...onBars(planet), cellStep: 1.056 }))
    expect(gatedOreValueProblemsOf([slowCells])).toEqual([])

    const flat = seedOf(SEED, (planet) => ({ ...onBars(planet), cellStep: planet === 7 ? 1 : 1.1 }))
    expect(gatedOreValueProblemsOf([flat])).toContain(
      `seed ${SEED} planet 7 holds x1.000 the ore cells of the planet before: the count must rise`,
    )
  })

  it('fails a planet whose surface band is as rich in ore as a deeper one, or a band no richer than the one above', () => {
    const problems = gatedOreValueProblemsOf([
      seedOf(SEED, (planet) => ({ ...onBars(planet), flatBands: planet === 3 })),
    ])
    expect(problems).toContain(
      `seed ${SEED} planet 3 band 1 holds as much ore per solid cell as band 2: ore must be scarce near the surface`,
    )
    expect(problems).toContain(
      `seed ${SEED} planet 3 band 2 is no richer per solid cell than band 1: ore must grow richer with depth`,
    )
  })

  it('judges every seed on its own pool', () => {
    const problems = gatedOreValueProblemsOf([
      seedOf(SEED, onBars),
      seedOf(SEED + 1, (planet) => ({ ...onBars(planet), pricePerCell: planet === 4 ? 1 : 1.2 })),
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(new RegExp(`^seed ${SEED + 1} planet 4 `))
  })

  it('splits each value step into the radius part and the mix and price part', () => {
    const [step] = oreStepsOf(seedOf(SEED, onBars))
    expect(step.planet).toBe(2)
    expect(step.radiusPart * step.mixAndPricePart).toBeCloseTo(step.valueStep, 6)
    expect(step.radiusPart).toBeCloseTo((400 / 300) ** 2, 6)
    expect(printedOreValueLinesOf([seedOf(SEED, onBars)])).toContain(
      `seed ${SEED} planet 2: value x${step.valueStep.toFixed(3)} = radius x1.778 * mix and price ` +
        `x${step.mixAndPricePart.toFixed(3)}, cells x1.100`,
    )
  })

  it('writes a report row a seed and planet with R(p), the canonical value and the measured steps', () => {
    const rows = oreValueReportRowsOf([seedOf(SEED, onBars)])
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({ planet: 1, radius: 300, valueStep: null, cellStep: null })
    expect(rows[1]).toMatchObject({ planet: 2, radius: 400, cellStep: '1.100' })
    expect(typeof rows[1].oreValue).toBe('string')
  })
})

/** What one synthetic planet's pool does against the planet before. */
interface PoolPlay {
  cellStep: number
  /** The value of a cell over the planet before's. */
  pricePerCell: number
  /** Every band the same ore share and value per cell. */
  flatBands: boolean
}

function onBars(_planet: number): PoolPlay {
  return { cellStep: 1.1, pricePerCell: 1.2, flatBands: false }
}

function seedOf(worldSeed: number, play: (planet: number) => PoolPlay): SeedOreCensus {
  const planets: PlanetOreCensus[] = []
  let oreCells = 10000
  let price = 10
  for (let planet = 1; planet <= 10; planet++) {
    const plan = play(planet)
    if (planet > 1) oreCells = Math.round(oreCells * plan.cellStep)
    if (planet > 1) price *= plan.pricePerCell
    planets.push(planetOf(planet, oreCells, price, plan.flatBands))
  }
  return { worldSeed, planets }
}

function planetOf(
  planet: number,
  oreCells: number,
  price: number,
  flatBands: boolean,
): PlanetOreCensus {
  const bands = [1, 2, 3, 4, 5].map((band) => bandOf(band, oreCells, price, flatBands))
  return {
    planet,
    radiusTiles: 200 + 100 * planet,
    oreCells: bands.reduce((sum, band) => sum + band.oreCells, 0),
    oreValue: bands.reduce((sum, band) => add(sum, band.oreValue), ZERO_MONEY),
    bands,
  }
}

/** Band b holds a fifth of the ore; deeper bands hold it in fewer solid cells at a higher price. */
function bandOf(band: number, oreCells: number, price: number, flatBands: boolean): BandOreCensus {
  const depth = flatBands ? 1 : band
  const cells = Math.round(oreCells / 5)
  return {
    band,
    solidCells: Math.round((cells * 10) / depth),
    oreCells: cells,
    oreValue: mul(fromSafeInteger(cells), fromFiniteNumber(price * depth)),
  }
}
