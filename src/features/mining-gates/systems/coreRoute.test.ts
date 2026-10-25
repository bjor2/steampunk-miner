import { describe, expect, it } from 'vitest'
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { planetsBefore } from '../../../systems/starMap/campaignIndex'
import { planetParamsAt } from '../../../systems/starMap/systemPlanetParams'
import { oreTypeOf } from '../../../systems/registries/oreTypes'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import { bandOfTile, isInsidePlanet } from '../../../systems/world/planetGeometry'
import { oreRulesVersionOnEntry, type PlanetParams } from '../../../systems/world/planetParams'
import { CHUNK_SIZE, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../systems/world/worldCell'
import { cellGateOf } from './cellGates'
import {
  generatedCellReader,
  isCoreReachableIn,
  isCoreReachableWith,
  type CellReader,
} from './coreRoute'

// D4 #863 CI (the HS rows on #647): gated rock is never the only route to the core, so every
// seed's core is reachable with the type-1 and type-2 charges, at s = 2, 3, 40 and 1e6.

const SYSTEMS = [2n, 3n, 40n, 1_000_000n]
const PLACES = [1n, 2n, 3n, 4n, 5n]
const PACING_SEEDS = [83921, 31415, 27182]
const TYPES_ONE_AND_TWO = [1, 2]
const EVERY_TYPE = [1, 2, 3]
const TIER_THREE = 3

function paramsAt(worldSeed: number, system: bigint, place: bigint): PlanetParams {
  const planetIndex = Number(planetsBefore(system) + place)
  return planetParamsAt(worldSeed, system, planetIndex, oreRulesVersionOnEntry(planetIndex))
}

/** A generated cell of tier-3 blast-only rock near the planet's north axis, and its tile. */
function tierThreeRockOf(params: PlanetParams): { cell: number; tile: TilePoint } | null {
  for (let cy = 0; cy * CHUNK_SIZE <= params.radiusTiles; cy++) {
    for (const cx of [-1, 0]) {
      const cells = generateChunkCells(params, cx, cy)
      for (let index = 0; index < cells.length; index++) {
        const tile = {
          tx: cx * CHUNK_SIZE + (index % CHUNK_SIZE),
          ty: cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE),
        }
        if (isTierThreeRock(params, cells[index], tile)) return { cell: cells[index], tile }
      }
    }
  }
  return null
}

function isTierThreeRock(params: PlanetParams, cell: number, tile: TilePoint): boolean {
  if (kindOfCell(cell) !== CELL_KIND.ore) return false
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const gate = cellGateOf(params, tile, ore)
  return gate.kind === 'dynamite' && gate.tier === TIER_THREE
}

/** The generated planet with every tile of `band` turned into `cell`: a whole shell of it. */
function walledIn(params: PlanetParams, band: number, cell: number): CellReader {
  const generated = generatedCellReader(params)
  return (tile) =>
    isInsidePlanet(params, tile.tx, tile.ty) && bandOfTile(params, tile.tx, tile.ty) === band
      ? cell
      : generated(tile)
}

describe('blast-only rock and the core (D4 #863)', () => {
  it.each(SYSTEMS)(
    'leaves every core of system %s reachable with type-1 and type-2 charges on every pacing seed',
    (system) => {
      const walled = PACING_SEEDS.flatMap((seed) =>
        PLACES.filter(
          (place) => !isCoreReachableWith(paramsAt(seed, system, place), TYPES_ONE_AND_TWO),
        ).map((place) => `seed ${seed} p${place}`),
      )
      expect(walled).toEqual([])
    },
    120_000,
  )

  it('finds no way past a band shelled in tier-3 rock with types 1 and 2, and one with type 3', () => {
    const params = paramsAt(PACING_SEEDS[0], 2n, 5n)
    const rock = tierThreeRockOf(params)
    expect(rock).not.toBeNull()
    const { cell, tile } = rock as { cell: number; tile: TilePoint }
    const shelled = walledIn(params, bandOfTile(params, tile.tx, tile.ty), cell)
    expect(isCoreReachableIn(params, shelled, TYPES_ONE_AND_TWO)).toBe(false)
    expect(isCoreReachableIn(params, shelled, EVERY_TYPE)).toBe(true)
  })
})
