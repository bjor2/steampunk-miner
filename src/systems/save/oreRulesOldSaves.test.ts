import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import { hardnessOfTile } from '../authority/groundDrill'
import { resourceTierOf } from '../authority/minedOre'
import { planetParamsOf } from '../authority/planetOfState'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { fnv1a64Hex, stateDigest } from '../authority/stateDigest'
import { blockHardness, oreSalePrice } from '../economy/oreEconomy'
import { add, toCanonical, ZERO_MONEY } from '../money'
import { oreTypeOf, saleTierOf } from '../registries/oreTypes'
import { chunkDigest } from '../world/chunkDigest'
import { generateChunk } from '../world/generateChunk'
import {
  DEEP_RARE_WINDOW_ORE_RULES,
  planetParamsFor,
  RARE_CLUSTER_ORE_RULES,
  type PlanetParams,
} from '../world/planetParams'
import { chunkRangeOfDisc } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, GROUND_CELL, kindOfCell } from '../world/worldCell'
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

/**
 * Ticket 448: a generator 10 save holding planet 5 under ore rules 2, the roster on the step bands,
 * pinned on main at 87d22ac5 (generator 10) over the same column. It is the rules 1 pin: the P3+
 * kind table is empty, so the roster draws no kind on planet 5 yet.
 */
const RULES_TWO_PLANET_5_PIN: ColumnPin = {
  chunks: '368e288725734121',
  ores: '725c63742d4dd98b',
  oreCells: 5678,
  value: '2.0218044481e+7',
}

/**
 * Ticket 625: a generator 11 save holding planet 5 under ore rules 4, the mixed roster on the depth
 * curve before the surface layer, pinned on main at 6477758c7 (generator 11) over the same column.
 */
const RULES_FOUR_PLANET_5_PIN: ColumnPin = {
  chunks: '920dd8e474b6422e',
  ores: '6a6b69294f5d9cf0',
  oreCells: 5734,
  value: '2.0931487044e+7',
}

/**
 * Ticket 643: a generator 12 save holding planet 5 under ore rules 6, on #6's ladder radius of 580
 * before the planet registry's 582, pinned on main at ebc24073f (generator 12) over the same column.
 * It is the rules 4 pin: the surface layer and P2's pool change no cell of planet 5.
 */
const RULES_SIX_PLANET_5_PIN: ColumnPin = {
  chunks: '920dd8e474b6422e',
  ores: '6a6b69294f5d9cf0',
  oreCells: 5734,
  value: '2.0931487044e+7',
}
const LADDER_RADIUS_PLANET_5 = 580

/**
 * Ticket 709: a generator 13 save holding planet 2 under ore rules 8, the last before P2's own
 * kinds, pinned on main at 02d6763f2 (generator 13) over the column through the planet's centre.
 */
const RULES_EIGHT_PLANET_2_PIN: ColumnPin = {
  chunks: 'aa09d00e7cb9d0fa',
  ores: '3b666d1343748659',
  oreCells: 3974,
  value: '3.72134821e+5',
}

/**
 * Ticket 737: a generator 14 save holding planet 2 under ore rules 9, the last before the rare
 * clusters, pinned over the column through the planet's centre on the rules 9 path, which the
 * generator golden's own kinds digest shows unchanged from generator 14.
 */
/** Planet 3's centre column under ore rules 10, as generator 15 made it (ticket 738). */
const RULES_TEN_PLANET_3_PIN: ColumnPin = {
  chunks: '7f2c5ee73fd14b30',
  ores: 'a2ac6489fac09a32',
  oreCells: 4517,
  value: '1.404472265e+6',
}

const RULES_NINE_PLANET_2_PIN: ColumnPin = {
  chunks: 'b81b64d877ccb648',
  ores: '3b666d1343748659',
  oreCells: 3974,
  value: '3.72134821e+5',
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

/** The pre-181 planet 5 state as if entered under ore rules 2, the roster without the curve. */
function rulesTwoPlanet5(): AuthorityState {
  const state = loaded(PLANET_5_SAVE)
  return { ...state, planet: { ...state.planet, oreRulesVersion: 2 } }
}

/** The pre-181 planet 5 state as if entered under ore rules 4, the last before the surface layer. */
function rulesFourPlanet5(): AuthorityState {
  const state = loaded(PLANET_5_SAVE)
  return { ...state, planet: { ...state.planet, oreRulesVersion: 4 } }
}

/** The pre-181 planet 5 state as if entered under ore rules 6, the last before the registry radius. */
function rulesSixPlanet5(): AuthorityState {
  const state = loaded(PLANET_5_SAVE)
  return { ...state, planet: { ...state.planet, oreRulesVersion: 6 } }
}

/** A fresh planet 2 session as if entered under ore rules 8, the last before P2's own kinds. */
function rulesEightPlanet2(): AuthorityState {
  const state = createAuthorityState({ planetIndex: 2, planetSeed: 83921, playerIds: ['p1'] })
  return { ...state, planet: { ...state.planet, oreRulesVersion: 8 } }
}

/** A fresh planet 2 session as if entered under ore rules 9, the last before the rare clusters. */
function rulesNinePlanet2(): AuthorityState {
  const state = createAuthorityState({ planetIndex: 2, planetSeed: 83921, playerIds: ['p1'] })
  return { ...state, planet: { ...state.planet, oreRulesVersion: 9 } }
}

/** A fresh planet 3 session as if entered under ore rules 10, the last before the deep window. */
function rulesTenPlanet3(): AuthorityState {
  const state = createAuthorityState({ planetIndex: 3, planetSeed: 83921, playerIds: ['p1'] })
  return { ...state, planet: { ...state.planet, oreRulesVersion: 10 } }
}

/** That state saved as generator `generatorVersion` wrote it. */
function generatorSaveOf(state: AuthorityState, generatorVersion: number): unknown {
  return { ...saveSlotOf(takeSnapshot(state), 1), generatorVersion }
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
      { version: 'generatorVersion', from: 10, to: 11 },
      { version: 'generatorVersion', from: 11, to: 12 },
      { version: 'generatorVersion', from: 12, to: 13 },
      { version: 'generatorVersion', from: 13, to: 14 },
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect('state' in reading && stateDigest(reading.state)).toBe(stateDigest(loaded(file)))
  })

  it('load a generator 9 save of a planet under ore rules 1 on those rules, drawing no kind (ticket 446)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesOnePlanet5(), 9))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 9, to: 10 },
      { version: 'generatorVersion', from: 10, to: 11 },
      { version: 'generatorVersion', from: 11, to: 12 },
      { version: 'generatorVersion', from: 12, to: 13 },
      { version: 'generatorVersion', from: 13, to: 14 },
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(1)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesOnePlanet5()))
    expect(columnPinOf(planetParamsOf(reading.state.planet) as PlanetParams)).toEqual(
      RULES_ONE_PLANET_5_PIN,
    )
  })

  it('load a generator 10 save of a planet under ore rules 2 on the step bands (ticket 448)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesTwoPlanet5(), 10))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 10, to: 11 },
      { version: 'generatorVersion', from: 11, to: 12 },
      { version: 'generatorVersion', from: 12, to: 13 },
      { version: 'generatorVersion', from: 13, to: 14 },
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(2)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesTwoPlanet5()))
    expect(columnPinOf(planetParamsOf(reading.state.planet) as PlanetParams)).toEqual(
      RULES_TWO_PLANET_5_PIN,
    )
  })

  it('load a generator 11 save of a planet under ore rules 4 with its terrain and shipped surface (ticket 625)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesFourPlanet5(), 11))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 11, to: 12 },
      { version: 'generatorVersion', from: 12, to: 13 },
      { version: 'generatorVersion', from: 13, to: 14 },
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(4)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesFourPlanet5()))
    const params = planetParamsOf(reading.state.planet) as PlanetParams
    expect(columnPinOf(params)).toEqual(RULES_FOUR_PLANET_5_PIN)
    const surfaceTile = { tx: 0, ty: params.radiusTiles - 1 }
    expect(toCanonical(hardnessOfTile(params, surfaceTile, GROUND_CELL))).toBe(
      toCanonical(blockHardness(5, 1)),
    )
  })

  it('load a generator 12 save of a planet under ore rules 6 on its ladder radius, every cell as main made it (ticket 643)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesSixPlanet5(), 12))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 12, to: 13 },
      { version: 'generatorVersion', from: 13, to: 14 },
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(6)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesSixPlanet5()))
    const params = planetParamsOf(reading.state.planet) as PlanetParams
    expect(params.radiusTiles).toBe(LADDER_RADIUS_PLANET_5)
    expect(columnPinOf(params)).toEqual(RULES_SIX_PLANET_5_PIN)
  })

  it('load a generator 13 save of planet 2 under ore rules 8 with its 12 species, every cell as main made it (ticket 709)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesEightPlanet2(), 13))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 13, to: 14 },
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(8)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesEightPlanet2()))
    const params = planetParamsOf(reading.state.planet) as PlanetParams
    expect(columnPinOf(params)).toEqual(RULES_EIGHT_PLANET_2_PIN)
  })

  it('load a generator 14 save of planet 2 under ore rules 9 with its whole rare patches, every cell as generator 14 made it (ticket 737)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesNinePlanet2(), 14))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 14, to: 15 },
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(9)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesNinePlanet2()))
    const params = planetParamsOf(reading.state.planet) as PlanetParams
    expect(columnPinOf(params)).toEqual(RULES_NINE_PLANET_2_PIN)
    const clustered = columnPinOf(planetParamsFor(83921, 2, RARE_CLUSTER_ORE_RULES))
    expect(clustered.oreCells).toBeLessThan(RULES_NINE_PLANET_2_PIN.oreCells)
  })

  it('load a generator 15 save of planet 3 under ore rules 10 with its band-2 rares, every cell as generator 15 made it (ticket 738)', () => {
    const reading = readMigratedSaveSlot(generatorSaveOf(rulesTenPlanet3(), 15))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations.filter((step) => 'version' in step)).toEqual([
      { version: 'generatorVersion', from: 15, to: 16 },
    ])
    expect(reading.state.planet.oreRulesVersion).toBe(10)
    expect(stateDigest(reading.state)).toBe(stateDigest(rulesTenPlanet3()))
    const params = planetParamsOf(reading.state.planet) as PlanetParams
    expect(columnPinOf(params)).toEqual(RULES_TEN_PLANET_3_PIN)
    const deep = columnPinOf(planetParamsFor(83921, 3, DEEP_RARE_WINDOW_ORE_RULES))
    expect(deep.chunks).not.toBe(RULES_TEN_PLANET_3_PIN.chunks)
  })
})
