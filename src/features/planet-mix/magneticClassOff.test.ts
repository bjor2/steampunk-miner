import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { GENERATION_HOOK_REGISTRY } from '../../systems/registries/generationHooks'
import { isElectrifiedCellAt, magneticFieldHolding } from '../../systems/registries/magneticGround'
import { entriesOf } from '../../systems/registries/seal'
import { generateChunkCells } from '../../systems/world/generateChunk'
import { planetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import {
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
  type TilePoint,
} from '../../systems/world/tileGrid'
import { withMagneticClassOff } from './magneticClassOff'
import { electrifiedTilesOfChunk } from './systems/electrifiedCells'

// The class-off seam of `balance:magnetic-planet` (GD lock on spec #258 Q7, ticket 294): the same
// planet index with the magnetic class switched off and all else equal.

const SEED = PACING_WORLD_SEEDS['bot-slice'][0]
const MAGNETIC_PLANET = 25

interface ElectrifiedCell {
  tile: TilePoint
  cell: number
}

/** The first electrified cell down the column through the planet's centre. */
function firstElectrifiedCell(params: PlanetParams): ElectrifiedCell {
  const { max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = 0; cy <= max; cy++) {
    const cells = generateChunkCells(params, 0, cy)
    const [tile] = electrifiedTilesOfChunk(params, cells, 0, cy)
    if (tile !== undefined) return { tile, cell: cells[cellIndexOf(tile, cy)] }
  }
  throw new RangeError(`no electrified cell down planet ${params.planetIndex}'s centre column`)
}

/** The tile's index in chunk `(0, cy)`'s cells, row by row. */
function cellIndexOf(tile: TilePoint, cy: number): number {
  return (tile.ty - firstTileOfChunk(cy)) * CHUNK_SIZE + (tile.tx - firstTileOfChunk(0))
}

describe('magnetic class off (balance:magnetic-planet)', () => {
  it('leaves no field and no electrified cell where the loaded class has them', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    const { tile, cell } = firstElectrifiedCell(params)
    expect(isElectrifiedCellAt(params, tile, cell)).toBe(true)
    expect(magneticFieldHolding(params, tile)).not.toBeNull()
    withMagneticClassOff(() => {
      expect(isElectrifiedCellAt(params, tile, cell)).toBe(false)
      expect(magneticFieldHolding(params, tile)).toBeNull()
    })
  })

  it('generates the same planet with the class off, all else equal', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    const on = generateChunkCells(params, 0, 1)
    const off = withMagneticClassOff(() => generateChunkCells(params, 0, 1))
    expect(Array.from(off)).toEqual(Array.from(on))
    expect(withMagneticClassOff(() => entriesOf(GENERATION_HOOK_REGISTRY))).toEqual(
      entriesOf(GENERATION_HOOK_REGISTRY),
    )
  })

  it('puts the loaded class back after the run, even when it throws', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    const { tile } = firstElectrifiedCell(params)
    expect(() =>
      withMagneticClassOff(() => {
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(magneticFieldHolding(params, tile)).not.toBeNull()
  })
})
