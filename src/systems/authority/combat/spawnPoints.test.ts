import { describe, expect, it } from 'vitest'
import { bandOfTile } from '../../world/planetGeometry'
import { planetParamsFor, type PlanetParams } from '../../world/planetParams'
import { chunkRangeOfDisc } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { spawnPointsOfChunk, spawnPointsWithin, type SpawnPoint } from './spawnPoints'

const WORLD_SEED = 83921

function planetSpawnPoints(params: PlanetParams, isReversed = false): SpawnPoint[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const chunks: [number, number][] = []
  for (let cy = min; cy <= max; cy++) for (let cx = min; cx <= max; cx++) chunks.push([cx, cy])
  if (isReversed) chunks.reverse()
  return chunks
    .flatMap(([cx, cy]) => spawnPointsOfChunk(params, cx, cy))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

const bandOf = (params: PlanetParams, point: SpawnPoint) =>
  bandOfTile(params, point.tile.tx, point.tile.ty)

describe('enemy spawn points (#9)', () => {
  const planet1 = planetParamsFor(WORLD_SEED, 1)
  const planet2 = planetParamsFor(WORLD_SEED, 2)

  it('gives the same seed the same list of kind, tier and cell in any chunk order', () => {
    const first = planetSpawnPoints(planet1)
    planetSpawnPoints(planetParamsFor(WORLD_SEED + 1, 1))
    expect(planetSpawnPoints(planet1, true)).toEqual(first)
  })

  it('puts about 150 to 200 points on planet 1, none in band 1', () => {
    const points = planetSpawnPoints(planet1)
    expect(points.length).toBeGreaterThanOrEqual(150)
    expect(points.length).toBeLessThanOrEqual(200)
    expect(points.filter((point) => bandOf(planet1, point) === 1)).toEqual([])
  })

  it('places crawlers on cave air and burrowers in rock, at the tier of their band', () => {
    for (const params of [planet1, planet2]) {
      for (const point of planetSpawnPoints(params)) {
        const cell = kindOfCell(cellAt(EMPTY_WORLD, params, point.tile))
        const home = point.kind === 'crawler' ? [CELL_KIND.air] : [CELL_KIND.ground, CELL_KIND.ore]
        expect(home).toContain(cell)
        expect(point.tier).toBe(1 + 6 * (params.planetIndex - 1) + bandOf(params, point) - 1)
      }
    }
  })

  it('keeps burrowers to planet 2 bands 3 to 5, about a third of the points there', () => {
    expect(planetSpawnPoints(planet1).some((point) => point.kind === 'burrower')).toBe(false)
    const deep = planetSpawnPoints(planet2).filter((point) => bandOf(planet2, point) >= 3)
    const burrowers = planetSpawnPoints(planet2).filter((point) => point.kind === 'burrower')
    expect(burrowers.every((point) => bandOf(planet2, point) >= 3)).toBe(true)
    expect(burrowers.length / deep.length).toBeGreaterThan(0.2)
    expect(burrowers.length / deep.length).toBeLessThan(0.5)
  })

  it('finds the points within a radius of a position in mm, by id', () => {
    const point = planetSpawnPoints(planet1)[0]
    const x = point.tile.tx * 1000 + 500
    const y = point.tile.ty * 1000 + 500
    const near = spawnPointsWithin(planet1, x + 23_000, y, 24)
    expect(near.map((found) => found.id)).toContain(point.id)
    expect(spawnPointsWithin(planet1, x + 25_000, y, 24).map((found) => found.id)).not.toContain(
      point.id,
    )
    expect(near.map((found) => found.id)).toEqual([...near.map((found) => found.id)].sort())
  })
})
