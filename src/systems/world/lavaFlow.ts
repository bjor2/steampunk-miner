/**
 * Lava flow (spec #113 "lava pockets flow into open tunnels"), integer only. Lava is a cell layer
 * over the ground (`lavaFlips` in the chunk delta): a lava cell is solid at density 255, and the
 * drill never cuts it. Each step, every loose lava cell, lowest first, moves one cell down: into the
 * 4-neighbour nearest the planet's centre that is open (an air cell whose samples hold at most
 * half of a solid cell, so ground a collapse refilled stays shut), strictly lower than it, not
 * guarded by the lining type that seals lava (refractory), and not where a vehicle's body is. The
 * cell it leaves opens to density 0, melting what little rock the open cell still held; the cell it
 * enters fills to 255 and loses any lining laid on it (standard lining lets lava through, #113). Lava that cannot move rests; the cells a lining kept
 * it out of are reported, so `lava_blocked` is logged once where it stopped.
 */
import { LAVA_CONTACT_REACH_MM } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import { cellDensitySum } from './cellYield'
import { withLavaFlipped } from './chunkDelta'
import type { BodyCentre } from './collapseRefill'
import {
  clearCasingSample,
  closeSession,
  editSample,
  openSession,
  type GroundChange,
} from './groundEditSession'
import { isGuardedByLining } from './liningGuard'
import type { PlanetParams } from './planetParams'
import { AIR_DENSITY, SAMPLES_PER_CELL, SAMPLES_PER_TILE, SOLID_DENSITY } from './sampleGrid'
import { FULL_WEIGHT } from './stampShape'
import { cellIndexOfTile, chunkOfTile, halfTileDistanceSq, type TilePoint } from './tileGrid'
import { isAirCell, isLavaCell } from './worldCell'
import {
  cellAt,
  currentCasingOfChunk,
  currentDensityOfChunk,
  deltaOfChunk,
  rememberCasing,
  rememberDensity,
  withChunkDelta,
  type WorldState,
} from './worldState'

export interface LavaFlowStep {
  world: WorldState
  changes: GroundChange[]
  /** The lava still free to move next step: where it moved to, and lava beside the cells it left. */
  loose: TilePoint[]
  /** Open cells loose lava could not enter for the lining guarding them. */
  blocked: TilePoint[]
}

/** What the lava may not flow into: a lining type's guard, and the vehicles' bodies. */
export interface LavaBarriers {
  guardTypeIndex: number
  bodies: readonly BodyCentre[]
}

type Move =
  { kind: 'moved'; to: TilePoint } | { kind: 'waiting' } | { kind: 'resting'; guarded: TilePoint[] }

const REACH_SQ_MM = LAVA_CONTACT_REACH_MM * LAVA_CONTACT_REACH_MM

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]

/** One step of every loose lava cell, lowest first. */
export function flowLava(
  world: WorldState,
  params: PlanetParams,
  loose: readonly TilePoint[],
  barriers: LavaBarriers,
): LavaFlowStep {
  let step: LavaFlowStep = { world, changes: [], loose: [], blocked: [] }
  for (const tile of lowestFirst(loose)) step = flowOneCell(step, params, tile, barriers)
  return { ...step, loose: uniqueTiles(step.loose) }
}

/** Lava cells beside newly opened cells: a pocket the drill broke into starts to flow. */
export function lavaBesideOpenings(
  world: WorldState,
  params: PlanetParams,
  opened: readonly TilePoint[],
): TilePoint[] {
  return uniqueTiles(
    opened.flatMap((tile) => neighboursOf(tile).filter((next) => isLavaAt(world, params, next))),
  )
}

/** An air cell (yielded or never solid) whose density is at most half of a solid cell's. */
function isOpenCell(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  if (!isAirCell(cellAt(world, params, tile))) return false
  return cellDensitySum(world, params, tile) * 2 <= SAMPLES_PER_CELL * SOLID_DENSITY
}

export function isLavaAt(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  return isLavaCell(cellAt(world, params, tile))
}

function flowOneCell(
  step: LavaFlowStep,
  params: PlanetParams,
  tile: TilePoint,
  barriers: LavaBarriers,
): LavaFlowStep {
  if (!isLavaAt(step.world, params, tile)) return step
  const move = moveOf(step.world, params, tile, barriers)
  if (move.kind === 'waiting') return { ...step, loose: [...step.loose, tile] }
  if (move.kind === 'resting') return { ...step, blocked: [...step.blocked, ...move.guarded] }
  const moved = moveLava(step.world, params, tile, move.to)
  return {
    world: moved.world,
    changes: [...step.changes, ...moved.changes],
    loose: [...step.loose, move.to, ...lavaBesideOpenings(moved.world, params, [tile])],
    blocked: step.blocked,
  }
}

/**
 * Whether lining of the guarding type keeps this lava cell out of an open cell below it: the one
 * thing a breach can undo (#133).
 */
export function isKeptOutByLining(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  guardTypeIndex: number,
): boolean {
  return openCellsBelow(world, params, tile).some((next) =>
    isGuardedByLining(world, next, guardTypeIndex),
  )
}

/** Where one lava cell goes: the lowest open cell below it, or why it stays. */
function moveOf(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  barriers: LavaBarriers,
): Move {
  const below = openCellsBelow(world, params, tile)
  const guarded = below.filter((next) => isGuardedByLining(world, next, barriers.guardTypeIndex))
  const free = below.filter((next) => !guarded.includes(next))
  const clear = free.filter((next) => !isNearAnyBody(next, barriers.bodies))
  if (clear.length > 0) return { kind: 'moved', to: clear[0] }
  if (free.length > 0) return { kind: 'waiting' }
  return { kind: 'resting', guarded }
}

/** The open 4-neighbours strictly lower than the cell, lowest first. */
function openCellsBelow(world: WorldState, params: PlanetParams, tile: TilePoint): TilePoint[] {
  return lowestFirst(neighboursOf(tile)).filter(
    (next) => isLower(next, tile) && isOpenCell(world, params, next),
  )
}

/** The lava leaves `from` open and fills `to`, its lava bits turned over in both chunks. */
function moveLava(world: WorldState, params: PlanetParams, from: TilePoint, to: TilePoint) {
  const session = openSession(world, params)
  samplesOfCell(from).forEach((sample) => editSample(session, sample, () => AIR_DENSITY))
  samplesOfCell(to).forEach((sample) => {
    editSample(session, sample, () => SOLID_DENSITY)
    clearCasingSample(session, sample)
  })
  const edit = closeSession(session)
  return { world: [from, to].reduce(flipLavaAt(params), edit.world), changes: edit.changes }
}

function flipLavaAt(params: PlanetParams) {
  return (world: WorldState, tile: TilePoint): WorldState => {
    const cx = chunkOfTile(tile.tx)
    const cy = chunkOfTile(tile.ty)
    const delta = withLavaFlipped(deltaOfChunk(world, cx, cy), [cellIndexOfTile(tile.tx, tile.ty)])
    rememberDensity(delta, currentDensityOfChunk(world, params, cx, cy))
    rememberCasing(delta, currentCasingOfChunk(world, cx, cy))
    return withChunkDelta(world, cx, cy, delta)
  }
}

function samplesOfCell(tile: TilePoint) {
  const samples = []
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      samples.push({
        sx: tile.tx * SAMPLES_PER_TILE + qx,
        sy: tile.ty * SAMPLES_PER_TILE + qy,
        weight: FULL_WEIGHT,
        floor: 0,
      })
    }
  }
  return samples
}

/** Whether a body's centre is within the lava's reach of the cell's square. */
export function isNearAnyBody(tile: TilePoint, bodies: readonly BodyCentre[]): boolean {
  return bodies.some((body) => squareDistanceSqMm(tile, body) <= REACH_SQ_MM)
}

/** The squared distance in mm from a point to the nearest point of a 1 m cell. */
export function squareDistanceSqMm(tile: TilePoint, point: BodyCentre): number {
  const dx = gapAlong(point.xMm, tile.tx)
  const dy = gapAlong(point.yMm, tile.ty)
  return dx * dx + dy * dy
}

function gapAlong(mm: number, cell: number): number {
  const low = cell * MM_PER_METRE
  return Math.max(0, low - mm, mm - (low + MM_PER_METRE))
}

function isLower(next: TilePoint, tile: TilePoint): boolean {
  return halfTileDistanceSq(next.tx, next.ty) < halfTileDistanceSq(tile.tx, tile.ty)
}

/** Nearest the centre first, then by row and column, so every machine flows the same. */
function lowestFirst(tiles: readonly TilePoint[]): TilePoint[] {
  return [...tiles].sort(
    (a, b) =>
      halfTileDistanceSq(a.tx, a.ty) - halfTileDistanceSq(b.tx, b.ty) || a.ty - b.ty || a.tx - b.tx,
  )
}

function neighboursOf(tile: TilePoint): TilePoint[] {
  return NEIGHBOURS.map(([dx, dy]) => ({ tx: tile.tx + dx, ty: tile.ty + dy }))
}

function uniqueTiles(tiles: readonly TilePoint[]): TilePoint[] {
  const seen = new Map<string, TilePoint>()
  for (const tile of tiles) seen.set(`${tile.tx},${tile.ty}`, tile)
  return lowestFirst([...seen.values()])
}
