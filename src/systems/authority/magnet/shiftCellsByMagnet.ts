/**
 * The terrain magnets' one way to move ground (GD lock on #246, Vertical caps; ticket 283): a field
 * names the cells it acts on, each with the open cells it may push that cell into, and this rule
 * decides what moves. The repulsor coil (#284) moves cells through it; the lode clamp (#285) asks
 * `cellsMagnetMayHold` which cells it pins and moves nothing.
 *
 * - At most `magnets.maxCellsMoved` (8) cells move in one use, in the order the field names them.
 * - Only cells the drill grade could dig move, each into the first open cell it may take
 *   (`magnetGround.ts`); with none, it stays.
 * - Cells are conserved: the moved cell lands whole, packed tier and family unchanged, in its own
 *   band, and the tile it left takes the open cell's air at density 0. Opening that tile yields it
 *   without credit, as every K6 density edit does, so it never pays for the cell a second time.
 * - Each moved cell costs `energyPerMovedCell`: the item's ask, never under its own dig energy. The
 *   use stops at the first cell the tank cannot pay for.
 *
 * The moves join the K6 power-up queue (`terrain/terrainEdits.ts`, TD #189) as two edits, every
 * origin opening before any destination fills, so a move the per-tick budget splits over ticks
 * leaves the cell nowhere for a tick but never in two places. The queue asks `canMine` again as it
 * applies them, with the magnet as the tool.
 */
import { energyPerMovedCell } from '../../economy/magnetCaps'
import { SOLID_DENSITY } from '../../world/sampleGrid'
import type { TilePoint } from '../../world/tileGrid'
import { cellAt, materialCellAt } from '../../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'
import { queueTerrainEdit, type TerrainCellEdit } from '../terrain/terrainEdits'
import {
  canTakeMovedCell,
  digQuantaOfCell,
  isMagnetMovable,
  openMagnetGround,
  takeTiles,
  type MagnetGround,
} from './magnetGround'

/** One cell a field acts on, and where it may go. */
export interface MagnetPush {
  from: TilePoint
  /** The open cells the field would push it into, best first; only ones touching `from` count. */
  to: readonly TilePoint[]
}

export interface MagnetShiftRequest {
  playerId: string
  /** `<slice>.<item>`: the item asking `canMine`, and the source its queued edits carry. */
  source: string
  /** The cells the field acts on, in the order it reaches them. */
  pushes: readonly MagnetPush[]
  /** The item's own energy per moved cell, in quanta; the cell's dig energy floors it. */
  askedQuantaPerCell: number
}

export interface MovedCell {
  from: TilePoint
  to: TilePoint
  /** The packed cell that moved, tier and family unchanged. */
  cell: number
  /** The open cell's air, left where the moved cell was. */
  displaced: number
  energyQuanta: number
}

export interface MagnetShift {
  moved: readonly MovedCell[]
  energyQuanta: number
}

/** What the field acts on and the cells it may hold, for the lode clamp. */
export interface MagnetHoldRequest {
  playerId: string
  source: string
  tiles: readonly TilePoint[]
}

export const NO_MAGNET_SHIFT: MagnetShift = { moved: [], energyQuanta: 0 }

/** Plans the use, charges its energy and queues its moves; the state is unchanged if none moves. */
export function shiftCellsByMagnet(
  state: AuthorityState,
  request: MagnetShiftRequest,
): { state: AuthorityState; shift: MagnetShift } {
  const shift = planMagnetShift(state, request)
  if (shift.moved.length === 0) return { state, shift }
  const charged = chargeShift(state, request.playerId, shift)
  return { state: queueShiftEdits(charged, request, shift), shift }
}

/** What the use would move, and for how much energy, without changing the state. */
export function planMagnetShift(state: AuthorityState, request: MagnetShiftRequest): MagnetShift {
  const params = planetParamsOf(state.planet)
  if (params === null) return NO_MAGNET_SHIFT
  const ground = openMagnetGround(state, params, request.playerId, request.source)
  return shiftOf(movesWithinCaps(ground, request))
}

/** The first `magnets.maxCellsMoved` of `tiles` the field may hold, in their order. */
export function cellsMagnetMayHold(state: AuthorityState, request: MagnetHoldRequest): TilePoint[] {
  const params = planetParamsOf(state.planet)
  if (params === null) return []
  const ground = openMagnetGround(state, params, request.playerId, request.source)
  return firstMovableTiles(ground, request.tiles)
}

function movesWithinCaps(ground: MagnetGround, request: MagnetShiftRequest): MovedCell[] {
  const moved: MovedCell[] = []
  let quantaLeft = vehicleOf(ground.state, request.playerId).energy
  for (const push of request.pushes) {
    if (moved.length === ground.caps.maxCellsMoved) break
    const move = moveOf(ground, push, request.askedQuantaPerCell)
    if (move === null) continue
    if (move.energyQuanta > quantaLeft) break
    takeTiles(ground, [move.from, move.to])
    moved.push(move)
    quantaLeft -= move.energyQuanta
  }
  return moved
}

/** The push's cell into its first open cell, or null when it stays. */
function moveOf(ground: MagnetGround, push: MagnetPush, askedQuanta: number): MovedCell | null {
  if (!isMagnetMovable(ground, push.from)) return null
  const to = push.to.find((open) => canTakeMovedCell(ground, push.from, open))
  if (to === undefined) return null
  const { world } = ground.state
  return {
    from: push.from,
    to,
    cell: cellAt(world, ground.params, push.from),
    displaced: materialCellAt(world, ground.params, to),
    energyQuanta: energyPerMovedCell(ground.caps, askedQuanta, digQuantaOfCell(ground, push.from)),
  }
}

function firstMovableTiles(ground: MagnetGround, tiles: readonly TilePoint[]): TilePoint[] {
  const held: TilePoint[] = []
  for (const tile of tiles) {
    if (held.length === ground.caps.maxCellsMoved) break
    if (!isMagnetMovable(ground, tile)) continue
    takeTiles(ground, [tile])
    held.push(tile)
  }
  return held
}

function shiftOf(moved: readonly MovedCell[]): MagnetShift {
  return { moved, energyQuanta: moved.reduce((sum, move) => sum + move.energyQuanta, 0) }
}

function chargeShift(state: AuthorityState, playerId: string, shift: MagnetShift): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, { ...vehicle, energy: vehicle.energy - shift.energyQuanta })
}

/** The origins open first, in one edit, then the destinations fill, in the next. */
function queueShiftEdits(
  state: AuthorityState,
  { playerId, source }: MagnetShiftRequest,
  shift: MagnetShift,
): AuthorityState {
  const opened = queueTerrainEdit(state, { playerId, source, cells: openingCellsOf(shift) })
  return queueTerrainEdit(opened, { playerId, source, cells: fillingCellsOf(shift) })
}

function openingCellsOf(shift: MagnetShift): TerrainCellEdit[] {
  return shift.moved.flatMap(({ from, displaced }): TerrainCellEdit[] => [
    { kind: 'density', ...from, density: 0 },
    { kind: 'swap', ...from, cell: displaced },
  ])
}

function fillingCellsOf(shift: MagnetShift): TerrainCellEdit[] {
  return shift.moved.flatMap(({ to, cell }): TerrainCellEdit[] => [
    { kind: 'density', ...to, density: SOLID_DENSITY },
    { kind: 'swap', ...to, cell },
  ])
}
