/**
 * The planet's ground read from its seed and edit log, a tile at a time and without generating a
 * chunk (TD scope g 2-3 on #316, ticket 341): `baseCellOfTile` for space, core and caves, the
 * chunk's ore patches (each patch's content after the slices' patch hooks), the lava pockets on the
 * plain ground left, then the dock, starter-vein and cache stamps, as `generateChunk` paints them;
 * then the chunk's delta (lava flows, overrides, yielded cells). Slices that paint whole chunks
 * (`paint` hooks, none registered yet) are left to a full-chunk read.
 *
 * Each chunk's reading is cached by its delta: its ore patches once, its kinds summed up once (the
 * scope's per-chunk hazard bitset), so a chunk that can hold nothing costs no tile reads. Render
 * only: it reads the replicated world, never writes it, and keeps nothing a save or digest sees.
 */
import { STRIP_CACHED_CHUNKS } from '../../../constants/hazardStrip'
import { cellGateLookProvider } from '../../registries/cellGateLook'
import { foldOreCell } from '../../registries/generationHooks'
import { artefactCacheTile, artefactCacheTiles } from '../../world/artefactCache'
import { baseCellOfTile, CAVE_LATTICE_TILES } from '../../world/baseTerrain'
import {
  EMPTY_CHUNK_DELTA,
  isCellYielded,
  materialCellOf,
  type ChunkDelta,
} from '../../world/chunkDelta'
import { dockSiteTiles } from '../../world/dockSite'
import { patchCellOf, patchesForChunk } from '../../world/generateChunk'
import type { PlanetParams } from '../../world/planetParams'
import { starterVeinTiles } from '../../world/starterVein'
import {
  CHUNK_SIZE,
  cellIndexOfTile,
  chunkOfTile,
  firstTileOfChunk,
  type TilePoint,
} from '../../world/tileGrid'
import {
  CELL_KIND,
  GROUND_CELL,
  LAVA_CELL,
  kindOfCell,
  tierOffsetOfCell,
} from '../../world/worldCell'
import { deltaOfChunk, type WorldState } from '../../world/worldState'
import { bandKindsAt, blockKindsOf, latticeKindsOf, type LatticeKinds } from './latticeKinds'
import type { StripGround } from './stripGround'
import { clearStripHit, STRIP_KIND, type StripHit } from './stripHits'

export interface SeededStripGround extends StripGround {
  readonly params: PlanetParams
  /** The world the next reads see; the frame sets it before sampling. */
  world: WorldState
  /** The cell `generateChunk` paints at `tile`, before any edit. */
  generatedCellAt(tile: TilePoint): number
}

interface ChunkReading {
  cx: number
  cy: number
  /** The world `delta` was read from. */
  world: WorldState | null
  delta: ChunkDelta
  editKinds: number
  /** Ore cells by cell index, filled on the first tile read. */
  oreCells: Map<number, number> | null
  /** The kinds the chunk's seed may hold, -1 until worked out. */
  seedKinds: number
}

interface SeededReads {
  params: PlanetParams
  /** The placed tiles by tile key: dock site, starter vein, cache. */
  stamps: Map<number, number>
  lattice: LatticeKinds
  readings: Map<number, ChunkReading>
}

const EVERY_KIND = 0xff
const KEY_OFFSET = 1 << 20
const KEY_SPAN = 1 << 21
const BLOCKS_PER_CHUNK_SIDE = CHUNK_SIZE / CAVE_LATTICE_TILES

export function createSeededStripGround(
  params: PlanetParams,
  world: WorldState,
): SeededStripGround {
  const reads: SeededReads = {
    params,
    stamps: stampedCellsOf(params),
    lattice: latticeKindsOf(params, artefactCacheTile(params)),
    readings: new Map<number, ChunkReading>(),
  }
  const ground: SeededStripGround = {
    params,
    world,
    radiusMetres: params.radiusTiles,
    chunkVersionOf: (cx, cy) => deltaOfChunk(ground.world, cx, cy).version,
    readTile: (tile, out) => readTileInto(reads, ground.world, out, tile),
    blockKindsAt: (tile) =>
      blockKindsOf(reads.lattice, tile) | readingAt(reads, ground.world, tile).editKinds,
    bandKindsAt: (tile) => bandKindsAt(reads.lattice, tile),
    generatedCellAt: (tile) => generatedCellIn(reads, readingAt(reads, ground.world, tile), tile),
  }
  return ground
}

function readTileInto(reads: SeededReads, world: WorldState, out: StripHit, tile: TilePoint): void {
  clearStripHit(out)
  const reading = readingAt(reads, world, tile)
  if (summedKindsOf(reads, reading) === 0) return
  const index = cellIndexOfTile(tile.tx, tile.ty)
  const material = materialCellOf(generatedCellIn(reads, reading, tile), reading.delta, index)
  if (kindOfCell(material) === CELL_KIND.lava) out.kinds = STRIP_KIND.lava
  else if (!isCellYielded(reading.delta, index)) writeCellHit(reads, out, material, tile)
}

function generatedCellIn(reads: SeededReads, reading: ChunkReading, tile: TilePoint): number {
  const stamped = reads.stamps.get(tileKeyOf(tile))
  if (stamped !== undefined) return stamped
  const base = baseCellOfTile(reads.params, tile.tx, tile.ty)
  if (base !== GROUND_CELL) return base
  const ore = oreCellsOf(reads, reading).get(cellIndexOfTile(tile.tx, tile.ty))
  if (ore !== undefined) return ore
  return reads.lattice.isLavaPocket(tile) ? LAVA_CELL : GROUND_CELL
}

/** Open air is a void unless the dock site cleared it; ore says its tier and any gate on it. */
function writeCellHit(reads: SeededReads, out: StripHit, cell: number, tile: TilePoint): void {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.air && !reads.stamps.has(tileKeyOf(tile))) out.kinds = STRIP_KIND.void
  else if (kind === CELL_KIND.core) out.kinds = STRIP_KIND.core
  else if (kind === CELL_KIND.artefactCache) out.kinds = STRIP_KIND.cache
  else if (kind === CELL_KIND.ore) writeOreHit(out, reads.params, cell, tile)
}

/** The gate's kind and opening major only: the look never names a tool, rig or size (#238). */
function writeOreHit(out: StripHit, params: PlanetParams, cell: number, tile: TilePoint): void {
  const look = cellGateLookProvider()?.cellGateLookOf(params, cell, tile) ?? null
  out.kinds = STRIP_KIND.ore
  out.oreTierOffset = tierOffsetOfCell(cell)
  if (look === null) return
  out.kinds |= STRIP_KIND.gate
  out.gateKind = look.kind
  out.gateOpensAtTipMajor = look.opensAtTipMajor ?? -1
}

/** The tile's chunk reading, its edits brought up to `world`. */
function readingAt(reads: SeededReads, world: WorldState, tile: TilePoint): ChunkReading {
  const reading = heldReadingOf(reads.readings, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  if (reading.world !== world) refreshEdits(reading, world)
  return reading
}

function heldReadingOf(readings: Map<number, ChunkReading>, cx: number, cy: number) {
  const key = (cx + KEY_OFFSET) * KEY_SPAN + (cy + KEY_OFFSET)
  const known = readings.get(key)
  if (known !== undefined) return known
  if (readings.size >= STRIP_CACHED_CHUNKS) dropOldestReading(readings)
  const reading = {
    cx,
    cy,
    world: null,
    delta: EMPTY_CHUNK_DELTA,
    editKinds: 0,
    oreCells: null,
    seedKinds: -1,
  }
  readings.set(key, reading)
  return reading
}

function dropOldestReading(readings: Map<number, ChunkReading>): void {
  const [oldest] = readings.keys()
  readings.delete(oldest)
}

function refreshEdits(reading: ChunkReading, world: WorldState): void {
  reading.world = world
  const delta = deltaOfChunk(world, reading.cx, reading.cy)
  if (delta === reading.delta) return
  reading.delta = delta
  reading.editKinds = editKindsOf(delta)
}

/** Overrides may hold anything; lava that flowed leaves lava or an empty pocket. */
function editKindsOf(delta: ChunkDelta): number {
  if (delta.overrides.length > 0) return EVERY_KIND
  return delta.lavaFlips.some((row) => row !== 0) ? STRIP_KIND.lava | STRIP_KIND.void : 0
}

function summedKindsOf(reads: SeededReads, reading: ChunkReading): number {
  if (reading.seedKinds < 0) reading.seedKinds = seedKindsOf(reads, reading)
  return reading.seedKinds | reading.editKinds
}

/** The lattice blocks' kinds, and ore (with any gate on it) where a patch or the vein paints. */
function seedKindsOf(reads: SeededReads, reading: ChunkReading): number {
  const isOreHeld = oreCellsOf(reads, reading).size > 0 || hasStampedOre(reads.stamps, reading)
  const oreKinds = isOreHeld ? STRIP_KIND.ore | STRIP_KIND.gate : 0
  return oreKinds | chunkBlockKindsOf(reads.lattice, reading.cx, reading.cy)
}

function oreCellsOf(reads: SeededReads, reading: ChunkReading): Map<number, number> {
  reading.oreCells ??= oreCellsOfChunk(reads.params, reading.cx, reading.cy)
  return reading.oreCells
}

function chunkBlockKindsOf(lattice: LatticeKinds, cx: number, cy: number): number {
  let kinds = 0
  for (let by = 0; by < BLOCKS_PER_CHUNK_SIDE; by++) {
    for (let bx = 0; bx < BLOCKS_PER_CHUNK_SIDE; bx++) {
      const tile = {
        tx: firstTileOfChunk(cx) + bx * CAVE_LATTICE_TILES,
        ty: firstTileOfChunk(cy) + by * CAVE_LATTICE_TILES,
      }
      kinds |= blockKindsOf(lattice, tile)
    }
  }
  return kinds
}

/**
 * The chunk's patch ore by cell index. A patch's tiles are plain ground of its band, so a tile is
 * painted unless an earlier patch took it, as `generateChunk` paints.
 */
function oreCellsOfChunk(params: PlanetParams, cx: number, cy: number): Map<number, number> {
  const cells = new Map<number, number>()
  for (const patch of patchesForChunk(params, cx, cy)) {
    const cell = patchCellOf(params, patch)
    for (const tile of patch.tiles) {
      const index = cellIndexOfTile(tile.tx, tile.ty)
      if (isTileInChunk(tile, cx, cy) && !cells.has(index))
        cells.set(index, foldOreCell(params, tile, cell))
    }
  }
  return cells
}

/** The placed tiles in stamping order, the later winning: dock site, starter vein, cache. */
function stampedCellsOf(params: PlanetParams): Map<number, number> {
  const placed = [
    ...dockSiteTiles(params),
    ...starterVeinTiles(params),
    ...artefactCacheTiles(params),
  ]
  return new Map(placed.map((tile) => [tileKeyOf(tile), tile.cell]))
}

function hasStampedOre(stamps: Map<number, number>, reading: ChunkReading): boolean {
  for (const [key, cell] of stamps) {
    const isOre = kindOfCell(cell) === CELL_KIND.ore
    if (isOre && isTileInChunk(tileOfKey(key), reading.cx, reading.cy)) return true
  }
  return false
}

function isTileInChunk(tile: TilePoint, cx: number, cy: number): boolean {
  return chunkOfTile(tile.tx) === cx && chunkOfTile(tile.ty) === cy
}

function tileKeyOf(tile: TilePoint): number {
  return (tile.tx + KEY_OFFSET) * KEY_SPAN + (tile.ty + KEY_OFFSET)
}

function tileOfKey(key: number): TilePoint {
  return { tx: Math.floor(key / KEY_SPAN) - KEY_OFFSET, ty: (key % KEY_SPAN) - KEY_OFFSET }
}
