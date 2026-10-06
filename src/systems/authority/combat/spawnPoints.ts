/**
 * Enemy spawn points (decision #9 "How many", coefficients from #6 section 5): a pure function of
 * the planet params, chunk by chunk, from the `enemySpawn` sub-seed hashed with the chunk
 * coordinates (#4 order-independent hashing), so streaming, replay and co-op see the same list.
 *
 * Each chunk rolls a few candidate slots. A slot lands on a random cell; it is kept with chance
 * `sp[band] / (10 * slots)`, which gives `sp[band]` points per 10 chunks on average. Its kind comes
 * from the bands each kind lives in, with the burrower share picked by the slot's hash where both
 * may live. The point then sits on the first cell from there (in the chunk, same band) that suits
 * the kind: cave air for a crawler, rock or ore for a burrower. Band 1 has none (`sp[1] = 0`).
 * From planet 7 a second roll thins every band by `m(p)` (#131 Systems, `densityByRadius`), so a
 * dive to the core passes about as many points as on planet 6 while the planets grow; it only ever
 * removes points the band roll kept, and planets 1 to 6 keep exactly the list they had.
 * The tunnel wrecker never sits on a spawn point: it comes to a vehicle's lined route (#111).
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { hashCell } from '../../cellRandom'
import { ECONOMY } from '../../economy/economy'
import { SPAWN_POINT_ENEMY_KINDS, type EnemyKind } from '../../economy/economyDefinition'
import { enemyTier, spawnDensityScale } from '../../economy/enemyStats'
import { floor, fromSafeInteger, mul, toSafeInteger } from '../../money'
import { SEED_PURPOSE, subSeedFor } from '../../world/generatorSeeds'
import { bandOfTile, isInsidePlanet } from '../../world/planetGeometry'
import type { PlanetParams } from '../../world/planetParams'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  chunkOfTile,
  firstTileOfChunk,
  type TilePoint,
} from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { currentCellsOfChunk, EMPTY_WORLD } from '../../world/worldState'

export interface SpawnPoint {
  /** `cx,cy#slot`: stable for the seed, so a used point is remembered by id. */
  id: string
  kind: EnemyKind
  tier: number
  tile: TilePoint
}

const { combat } = ECONOMY.enemies
/** A tile is 1 m (#4). */
const MM_PER_TILE = MM_PER_METRE
const HALF_TILE_MM = MM_PER_TILE / 2
/** `spawnPointsPer10ChunksByBand` counts points per this many chunks. */
const CHUNKS_PER_WEIGHT = 10
const SLOTS_PER_CHUNK = Math.ceil(
  Math.max(...combat.spawnPointsPer10ChunksByBand) / CHUNKS_PER_WEIGHT,
)
/** What each slot's hash decides; part of the generated world, like a seed purpose. */
const SLOT_HASH = { cell: 0, keep: 1, kind: 2, density: 3 } as const
/** Resolution of the density roll: a slot the band keeps stays with chance `m(p)` (#131). */
const DENSITY_ROLL_RANGE = 1_000_000

interface SpawnPlanet {
  params: PlanetParams
  /** A slot's density roll below this keeps it; the whole range at `m(p) = 1`. */
  densityKeepBelow: number
  byChunk: Map<string, readonly SpawnPoint[]>
}

let cacheOfPlanet: SpawnPlanet | null = null

export function spawnPointsOfChunk(
  params: PlanetParams,
  cx: number,
  cy: number,
): readonly SpawnPoint[] {
  const planet = spawnPlanetOf(params)
  const key = `${cx},${cy}`
  const cached = planet.byChunk.get(key)
  if (cached !== undefined) return cached
  const points = generateSpawnPoints(planet, cx, cy)
  planet.byChunk.set(key, points)
  return points
}

/** Points whose tile centre is within `radiusTiles` of a point in mm, by id. */
export function spawnPointsWithin(
  params: PlanetParams,
  x: number,
  y: number,
  radiusTiles: number,
): SpawnPoint[] {
  const radiusMm = radiusTiles * MM_PER_TILE
  return chunksAround(x, y, radiusMm)
    .flatMap(({ cx, cy }) => spawnPointsOfChunk(params, cx, cy))
    .filter((point) => isWithinMm(point.tile, x, y, radiusMm))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** Tile centre of a spawn point in mm, where its enemy appears. */
export function spawnPositionOf(tile: TilePoint): { x: number; y: number } {
  return { x: tile.tx * MM_PER_TILE + HALF_TILE_MM, y: tile.ty * MM_PER_TILE + HALF_TILE_MM }
}

function spawnPlanetOf(params: PlanetParams): SpawnPlanet {
  if (cacheOfPlanet === null || !isSamePlanet(cacheOfPlanet.params, params)) {
    cacheOfPlanet = { params, densityKeepBelow: densityKeepBelowOf(params), byChunk: new Map() }
  }
  return cacheOfPlanet
}

function densityKeepBelowOf(params: PlanetParams): number {
  const range = fromSafeInteger(DENSITY_ROLL_RANGE)
  return toSafeInteger(floor(mul(spawnDensityScale(params.planetIndex), range)))
}

function isSamePlanet(a: PlanetParams, b: PlanetParams): boolean {
  return a.worldSeed === b.worldSeed && a.planetIndex === b.planetIndex
}

function generateSpawnPoints(planet: SpawnPlanet, cx: number, cy: number): SpawnPoint[] {
  const chunkSeed = hashCell(subSeedFor(planet.params, SEED_PURPOSE.enemySpawn), cx, cy)
  const points: SpawnPoint[] = []
  for (let slot = 0; slot < SLOTS_PER_CHUNK; slot++) {
    const point = spawnPointOfSlot(planet, cx, cy, chunkSeed, slot)
    if (point !== null) points.push(point)
  }
  return points
}

function spawnPointOfSlot(
  planet: SpawnPlanet,
  cx: number,
  cy: number,
  chunkSeed: number,
  slot: number,
): SpawnPoint | null {
  const { params } = planet
  const startIndex = hashCell(chunkSeed, slot, SLOT_HASH.cell) % CHUNK_CELLS
  const start = tileOfCellIndex(cx, cy, startIndex)
  if (!isInsidePlanet(params, start.tx, start.ty)) return null
  const band = bandOfTile(params, start.tx, start.ty)
  if (!isSlotKept(band, hashCell(chunkSeed, slot, SLOT_HASH.keep))) return null
  if (!isSlotDenseEnough(planet, hashCell(chunkSeed, slot, SLOT_HASH.density))) return null
  const kind = kindAt(params.planetIndex, band, hashCell(chunkSeed, slot, SLOT_HASH.kind))
  if (kind === null) return null
  const tile = firstSuitableTile(params, cx, cy, startIndex, kind, band)
  if (tile === null) return null
  return { id: `${cx},${cy}#${slot}`, kind, tier: enemyTier(params.planetIndex, band), tile }
}

function isSlotKept(band: number, roll: number): boolean {
  const weight = combat.spawnPointsPer10ChunksByBand[band - 1]
  return roll % (CHUNKS_PER_WEIGHT * SLOTS_PER_CHUNK) < weight
}

/** The planet-size thinning on top of the band roll, so `m(p) = 1` keeps every slot (#131). */
function isSlotDenseEnough(planet: SpawnPlanet, roll: number): boolean {
  return roll % DENSITY_ROLL_RANGE < planet.densityKeepBelow
}

/** The kinds that live in this band of this planet; where two do, the burrower share decides. */
function kindAt(planetIndex: number, band: number, roll: number): EnemyKind | null {
  const living = SPAWN_POINT_ENEMY_KINDS.filter((kind) => livesIn(kind, planetIndex, band))
  if (living.length < 2) return living[0] ?? null
  const { numerator, denominator } = combat.burrowerShare
  return roll % denominator < numerator ? 'burrower' : 'crawler'
}

function livesIn(kind: EnemyKind, planetIndex: number, band: number): boolean {
  const enemy = ECONOMY.enemies.kinds.find((candidate) => candidate.id === kind)
  return enemy !== undefined && planetIndex >= enemy.firstPlanet && enemy.bands.includes(band)
}

function firstSuitableTile(
  params: PlanetParams,
  cx: number,
  cy: number,
  startIndex: number,
  kind: EnemyKind,
  band: number,
): TilePoint | null {
  const cells = currentCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  for (let step = 0; step < CHUNK_CELLS; step++) {
    const index = (startIndex + step) % CHUNK_CELLS
    const tile = tileOfCellIndex(cx, cy, index)
    if (isHomeCell(kind, cells[index]) && bandOfTile(params, tile.tx, tile.ty) === band) return tile
  }
  return null
}

/** A crawler lives in cave air, a burrower in rock or ore (#9 roster). */
function isHomeCell(kind: EnemyKind, cell: number): boolean {
  const cellKind = kindOfCell(cell)
  if (kind === 'crawler') return cellKind === CELL_KIND.air
  return cellKind === CELL_KIND.ground || cellKind === CELL_KIND.ore
}

function tileOfCellIndex(cx: number, cy: number, index: number): TilePoint {
  return {
    tx: firstTileOfChunk(cx) + (index % CHUNK_SIZE),
    ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
  }
}

function chunksAround(x: number, y: number, radiusMm: number): { cx: number; cy: number }[] {
  const chunks: { cx: number; cy: number }[] = []
  for (let cy = chunkOfMm(y - radiusMm); cy <= chunkOfMm(y + radiusMm); cy++) {
    for (let cx = chunkOfMm(x - radiusMm); cx <= chunkOfMm(x + radiusMm); cx++) {
      chunks.push({ cx, cy })
    }
  }
  return chunks
}

function chunkOfMm(mm: number): number {
  return chunkOfTile(Math.floor(mm / MM_PER_TILE))
}

function isWithinMm(tile: TilePoint, x: number, y: number, radiusMm: number): boolean {
  const centre = spawnPositionOf(tile)
  const dx = centre.x - x
  const dy = centre.y - y
  return dx * dx + dy * dy <= radiusMm * radiusMm
}
