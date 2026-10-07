import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { chunkRangeOfDisc } from '../../../systems/world/tileGrid'
import { electrifiedTilesOfChunk } from './electrifiedCells'
import { magneticFieldAt, magneticFieldsNearChunk, type MagneticField } from './magneticFields'

const SEED = PACING_WORLD_SEEDS['bot-slice'][0]
const OTHER_SEED = PACING_WORLD_SEEDS['bot-slice'][1]
const MAGNETIC_PLANET = 25

/** The params a fresh session builds for its planet, as every player of it does. */
function sessionParamsOn(planetIndex: number, planetSeed: number): PlanetParams {
  const state = createAuthorityState({ planetIndex, planetSeed, playerIds: ['p1'] })
  return planetParamsOf(state.planet) as PlanetParams
}

/** The chunks of the column through the planet's centre, surface to centre. */
function centreColumnChunks(params: PlanetParams): { cx: number; cy: number }[] {
  const { max } = chunkRangeOfDisc(params.radiusTiles)
  return Array.from({ length: max + 1 }, (_, cy) => ({ cx: 0, cy }))
}

/** The column's fields and electrified tiles as the bytes a peer would compare. */
function magneticBytesOf(params: PlanetParams): Buffer {
  const chunks = centreColumnChunks(params).map(({ cx, cy }) => ({
    fields: magneticFieldsNearChunk(params, cx, cy),
    electrified: electrifiedTilesOfChunk(params, generateChunkCells(params, cx, cy), cx, cy),
  }))
  return Buffer.from(JSON.stringify(chunks), 'utf8')
}

function countsOf(bytes: Buffer): { fields: number; electrified: number } {
  const chunks = JSON.parse(bytes.toString('utf8')) as {
    fields: unknown[]
    electrified: unknown[]
  }[]
  return {
    fields: chunks.reduce((sum, chunk) => sum + chunk.fields.length, 0),
    electrified: chunks.reduce((sum, chunk) => sum + chunk.electrified.length, 0),
  }
}

function veinDistanceSq(field: MagneticField, tx: number, ty: number): number {
  return (field.vein.tx - tx) ** 2 + (field.vein.ty - ty) ** 2
}

describe('magnetic fields', () => {
  it('two sessions on one planet seed get byte-identical fields and electrified cells', () => {
    const first = magneticBytesOf(sessionParamsOn(MAGNETIC_PLANET, SEED))
    const second = magneticBytesOf(sessionParamsOn(MAGNETIC_PLANET, SEED))
    expect(first.equals(second)).toBe(true)
    expect(countsOf(first).fields).toBeGreaterThan(0)
    expect(countsOf(first).electrified).toBeGreaterThan(0)
  })

  it('draws them from the planet seed: another seed gets other fields', () => {
    const first = magneticBytesOf(sessionParamsOn(MAGNETIC_PLANET, SEED))
    const other = magneticBytesOf(sessionParamsOn(MAGNETIC_PLANET, OTHER_SEED))
    expect(first.equals(other)).toBe(false)
  })

  it('throws no field and electrifies no cell off the magnetic planets, P30 included', () => {
    const offClass = [1, 8, 24, 30, 33, 41].map((planet) =>
      countsOf(magneticBytesOf(planetParamsFor(SEED, planet))),
    )
    expect(offClass).toEqual(Array(6).fill({ fields: 0, electrified: 0 }))
  })

  it('answers the field holding a tile with the nearest vein, and null outside every field', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    const [field] = centreColumnChunks(params).flatMap(({ cx, cy }) =>
      magneticFieldsNearChunk(params, cx, cy),
    )
    const edge = { tx: field.vein.tx + field.radiusTiles, ty: field.vein.ty }
    const found = magneticFieldAt(params, edge) as MagneticField
    expect(veinDistanceSq(found, edge.tx, edge.ty)).toBeLessThanOrEqual(found.radiusTiles ** 2)
    expect(veinDistanceSq(found, edge.tx, edge.ty)).toBeLessThanOrEqual(field.radiusTiles ** 2)
    expect(magneticFieldAt(params, { tx: 0, ty: params.radiusTiles + 40 })).toBeNull()
  })
})
