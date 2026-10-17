import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { resourceTierOf } from '../authority/minedOre'
import { planetParamsOf } from '../authority/planetOfState'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { fnv1a64Hex, stateDigest } from '../authority/stateDigest'
import { oreSalePrice } from '../economy/oreEconomy'
import { add, toCanonical, ZERO_MONEY } from '../money'
import { oreTypeOf, saleTierOf } from '../registries/oreTypes'
import { chunkDigest } from '../world/chunkDigest'
import { generateChunk } from '../world/generateChunk'
import type { PlanetParams } from '../world/planetParams'
import { chunkRangeOfDisc } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import PLANET_10_SAVE from './fixtures/pre-175-planet-10.save.json'
import PLANET_5_SAVE from './fixtures/pre-181-planet-5.save.json'
import { migrateSaveSlot, readMigratedSaveSlot } from './saveMigrations'
import { saveSlotOf } from './saveSlot'

// Ticket 445 acceptance (Horizontal Scaler, #139 comment 6203133480 section 5.1; TD ruling on
// #445): a save written before the ore rules loads its planet on the legacy rows, so every chunk
// regenerates as main generated it, every ore cell holds the ore it held, and the ore sells at the
// same prices. The pins were taken on main (b4f3c73a, generator 8) over the column of chunks through
// each fixture planet's centre: the chunk digests, the ore ids in cell order, and their sale value.

interface ColumnPin {
  chunks: string
  ores: string
  oreCells: number
  value: string
}

const MAIN_PINS: Record<number, ColumnPin> = {
  1: {
    chunks: '870c3061d652c8a2',
    ores: 'c641f5e868690d20',
    oreCells: 2993,
    value: '7.9151249e+4',
  },
  5: {
    chunks: 'd5f9cde5688320d1',
    ores: '7f2b537eb3db1cbe',
    oreCells: 5678,
    value: '1.9903490675e+7',
  },
  10: {
    chunks: 'be6e8b655ef3ae7e',
    ores: '0ad08a11f5a5da70',
    oreCells: 7081,
    value: '1.1229048552326e+10',
  },
}

/**
 * Ticket 446: a generator 9 save holding planet 5 under ore rules 1, the rarity rows without the
 * roster, pinned on main at f49323ba (generator 9) over the same column.
 */
const RULES_ONE_PLANET_5_PIN: ColumnPin = {
  chunks: '368e288725734121',
  ores: '725c63742d4dd98b',
  oreCells: 5678,
  value: '2.0218044481e+7',
}

const FIXTURES = [
  ['pre-175 planet 1', PLANET_1_SAVE],
  ['pre-181 planet 5', PLANET_5_SAVE],
  ['pre-175 planet 10', PLANET_10_SAVE],
] as const

function loaded(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** The pre-181 planet 5 state as if entered under ore rules 1, the rarity rows alone. */
function rulesOnePlanet5(): AuthorityState {
  const state = loaded(PLANET_5_SAVE)
  return { ...state, planet: { ...state.planet, oreRulesVersion: 1 } }
}

/** That state saved as generator 9 wrote it. */
function generator9SaveOf(state: AuthorityState): unknown {
  return { ...saveSlotOf(takeSnapshot(state), 1), generatorVersion: 9 }
}

/** The column through the planet's centre as main pinned it. */
function columnPinOf(params: PlanetParams): ColumnPin {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const chunks = Array.from({ length: max - min + 1 }, (_, at) =>
    generateChunk(params, 0, min + at),
  )
  const ores = chunks.flatMap((chunk) =>
    Array.from(chunk.cells)
      .filter((cell) => kindOfCell(cell) === CELL_KIND.ore)
      .map((cell) =>
        oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) }),
      ),
  )
  return {
    chunks: fnv1a64Hex(chunks.map(chunkDigest).join('')),
    ores: fnv1a64Hex(ores.map((ore) => ore.id).join(',')),
    oreCells: ores.length,
    value: toCanonical(ores.map((ore) => oreSalePrice(saleTierOf(ore))).reduce(add, ZERO_MONEY)),
  }
}

describe('saves written before the ore rules', () => {
  it.each(FIXTURES)('load the %s save on the legacy rows, unstamped', (_, file) => {
    const { planet } = loaded(file)
    expect('oreRulesVersion' in planet).toBe(false)
    expect(planetParamsOf(planet)?.oreRulesVersion).toBeUndefined()
  })

  it.each(FIXTURES)(
    'regenerate the planet of the %s save with the chunks, ores and sale value main had',
    (_, file) => {
      const { planet } = loaded(file)
      const params = planetParamsOf(planet) as PlanetParams
      expect(columnPinOf(params)).toEqual(MAIN_PINS[planet.index])
    },
  )

  it.each(FIXTURES)('keep the %s state whole through the generator 8 -> 9 step', (_, file) => {
    const { migrated } = migrateSaveSlot(file)
    const atGenerator8 = { ...(migrated as object), generatorVersion: 8 }
    const reading = readMigratedSaveSlot(atGenerator8)
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 8, to: 9 },
      { version: 'generatorVersion', from: 9, to: 10 },
    ])
    expect('state' in reading && stateDigest(reading.state)).toBe(stateDigest(loaded(file)))
  })

  it('load a generator 9 save of a planet under ore rules 1 on those rules, drawing no kind (ticket 446)', () => {
    const reading = readMigratedSaveSlot(generator9SaveOf(rulesOnePlanet5()))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 9, to: 10 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(1)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesOnePlanet5()))
    expect(columnPinOf(planetParamsOf(reading.state.planet) as PlanetParams)).toEqual(
      RULES_ONE_PLANET_5_PIN,
    )
  })
})
