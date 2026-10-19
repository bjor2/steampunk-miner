/**
 * The swept cut's front (ticket 570, the TD shape on #570 points 1 and 2): where a tick's cut
 * reaches, and the work it carries to the next tick.
 *
 * - The carry walk (`vehicle/carryWalk.ts`) still pays whole cells as the stamp's centre enters
 *   them, in walk order, gates first. The stamp's centre is the front (`world/cutFront.ts`): a paid
 *   cell is cleared only as far as the front has passed, and what stands of it ahead is cleared on
 *   the tick the front passes it, its cell then being the cursor's, which the walk never prices
 *   again. So no cell is ever paid twice.
 * - **The bite** (`frontGroundOf`, the walk's `biteInto`): where the walk stops short of a cell it
 *   cannot yet pay in full, its work is no longer banked whole. The front bites into that cell as
 *   far as the work pays for what the bite removes, the cell priced before and after as the walk
 *   prices it (`sweptCarry.ts`: its drill time times its uncut share, rounded up), and only the
 *   rest carries. The front so moves at the drill's speed on every tick, never a whole cell at
 *   once, and over a column the sub-steps spent still sum to the cells' prices exactly: each bite
 *   pays what it lowered the price by.
 * - The front never passes the stamp at the pose: the tick's step (`frontStepMmAt`). A walk that
 *   reaches it banks toward the next cell as before, short of that cell's price.
 * - A hard stop keeps the walk's reach: nothing is bitten or carved past a gate. A carry end
 *   (core, lava, a hazard, a full hold, an empty tank) carries nothing on, but the cell it ended at
 *   is paid, so the front carves on through it as far as the step goes.
 */
import type { CarryGround, CarryReach, CellBite, CellCrossing } from '../vehicle/carryWalk'
import { centreTileAtStep, pointAtStep, type SweepPath } from '../vehicle/sweptCut'
import { facingVectorOf, type VehiclePose } from '../vehicle/vehiclePose'
import type { YieldedCell } from '../world/cellYield'
import type { CutFront } from '../world/cutFront'
import { carveDisc, type CarveWindow, type CellDrillTicks } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp, StampPoint } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { DrillCarveRequest } from './drillGearCut'
import { frontCarryGroundOf, yieldedInWalkOrder } from './sweptCarry'

/** Where a tick's front stands, and the work it carries on, in sub-steps of the tick's quantum. */
export interface SweptFront {
  point: StampPoint
  carrySubSteps: number
}

/**
 * What a tick's front bites with: its path and stamp, the point its carve runs from (`rear`,
 * `sweptStampAt.ts`), its pose and the request.
 */
export interface FrontSweep {
  path: SweepPath
  stamp: DiscStamp
  rear: StampPoint
  pose: VehiclePose
  request: DrillCarveRequest
}

/** A tick's front sweep, and how far its walk reached. */
export interface FrontCut extends FrontSweep {
  reach: CarryReach
}

/**
 * The ground a cutting tick's walk reads (`frontCarryGroundOf`), its front biting into the cell
 * the work cannot pay in full.
 */
export function frontGroundOf(params: PlanetParams, sweep: FrontSweep): CarryGround {
  const ground = frontCarryGroundOf(params, sweep.request, sweep.path)
  return { ...ground, biteInto: (crossing, work) => biteOf(params, sweep, crossing, work) }
}

/** The front a tick's work reaches: its bite, a carry end's cell carved through, or its reach. */
export function sweptFrontOf(params: PlanetParams, cut: FrontCut): SweptFront {
  const { reach } = cut
  if (reach.front !== undefined) return { point: reach.front, carrySubSteps: reach.carrySubSteps }
  const reached = pointAtStep(cut.path, reach.reachedStep)
  if (isCarriedTowardStop(params, cut)) return { point: reached, carrySubSteps: 0 }
  return {
    point: pointAtStep(cut.path, stepThroughEndingCellOf(cut)),
    carrySubSteps: reach.carrySubSteps,
  }
}

/**
 * A walk that ended at a cell it paid (core, lava, a hazard, a full hold, an empty tank) carries
 * nothing on, but that cell is paid: the front carves on through it as far as the step goes, so
 * the body is not held at its near side. Any other reach stands.
 */
function stepThroughEndingCellOf({ path, reach }: FrontCut): number {
  if (!isEndedAtPaidCell(reach)) return reach.reachedStep
  const cell = centreTileAtStep(path, reach.reachedStep)
  let step = reach.reachedStep
  while (step < path.steps && isSameTile(centreTileAtStep(path, step + 1), cell)) step++
  return step
}

/** The walk's reach is the sub-step it entered its last paid cell at, with nothing carried. */
function isEndedAtPaidCell({ paidSteps, reachedStep, carrySubSteps, target }: CarryReach) {
  return target === null && carrySubSteps === 0 && paidSteps.at(-1) === reachedStep
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

/** The front plane at a point of the path, square to the pose's facing, cutting from `rear`. */
export function cutFrontAt(pose: VehiclePose, point: StampPoint, rear: StampPoint): CutFront {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return { xMm: point.xMm, yMm: point.yMm, aheadX: ahead.x, aheadY: ahead.y, rear }
}

/** The window the carve takes at a front. */
export function windowAtFront(window: CarveWindow, front: CutFront): CarveWindow {
  return { ...window, front }
}

/**
 * The walk banked work toward a cell the drill may not cut (a gate, its scratch floor): the front
 * held short of it, the step it took ended before the walk could meet it, so the carry is
 * discarded here as the walk discards it at a stop (Horizontal Scaler, condition (b)).
 */
function isCarriedTowardStop(params: PlanetParams, { reach, request, path }: FrontCut): boolean {
  if (reach.target === null || reach.carrySubSteps === 0) return false
  return frontCarryGroundOf(params, request, path).isStop(reach.target)
}

/**
 * The furthest point of the path that `work` pays a bite into the crossed cell for, and the work
 * that bite spends: the fall in the cell's price. Searched from the path's start, not the walk's
 * reach: on a tilted path the front square to the facing meets a corner of the next cell before
 * the stamp's centre enters it, and stands short of the reach where the work cannot pay that.
 */
function biteOf(
  params: PlanetParams,
  sweep: FrontSweep,
  { tile }: CellCrossing,
  work: number,
): CellBite {
  const segment = segmentOf(sweep.path.from, sweep.path.to)
  const before = frontCarryGroundOf(params, sweep.request, sweep.path).cellAt(tile).price
  const costAt = (mm: number) => before - priceLeftAt(params, sweep, tile, pointAlong(segment, mm))
  const mm = furthestWithin(segment.lengthMm, (along) => costAt(along) <= work)
  return { spent: costAt(mm), front: pointAlong(segment, mm) }
}

/** What is left of the cell's price once the front at `point` has carved it alone, as the carve does. */
function priceLeftAt(
  params: PlanetParams,
  { request, stamp, rear, pose, path }: FrontSweep,
  cell: TilePoint,
  point: StampPoint,
): number {
  const disc = { ...stamp, ...point, tail: rear }
  const window = windowAtFront(request.window, cutFrontAt(pose, point, rear))
  const drillTicksOf = cellAloneOf(request.gates.drillTicksOf, cell)
  const world = carveDisc(request.world, params, disc, window, drillTicksOf).world
  return frontCarryGroundOf(params, { ...request, world }, path).cellAt(cell).price
}

/** `drillTicksOf` for `cell`; null, not drillable, for every other cell. */
function cellAloneOf(drillTicksOf: CellDrillTicks, cell: TilePoint): CellDrillTicks {
  return (tile, material, casingGrade) =>
    tile.tx === cell.tx && tile.ty === cell.ty ? drillTicksOf(tile, material, casingGrade) : null
}

/** A straight run from one point to another, and its length in whole mm (at least 1). */
interface Segment {
  from: StampPoint
  to: StampPoint
  lengthMm: number
}

function segmentOf(from: StampPoint, to: StampPoint): Segment {
  const dx = to.xMm - from.xMm
  const dy = to.yMm - from.yMm
  return { from, to, lengthMm: Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy))) }
}

/** The point `mm` along the segment, in whole mm. */
function pointAlong({ from, to, lengthMm }: Segment, mm: number): StampPoint {
  return {
    xMm: from.xMm + Math.floor(((to.xMm - from.xMm) * mm) / lengthMm),
    yMm: from.yMm + Math.floor(((to.yMm - from.yMm) * mm) / lengthMm),
  }
}

/** The largest whole mm in `[0, lengthMm]` that `isWithin` holds for; it holds at 0 and falls once. */
function furthestWithin(lengthMm: number, isWithin: (mm: number) => boolean): number {
  if (isWithin(lengthMm)) return lengthMm
  let low = 0
  let high = lengthMm
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (isWithin(middle)) low = middle
    else high = middle
  }
  return low
}

/**
 * The yielded cells in the order a cutting tick's front reached them (ticket 570, the Horizontal
 * Scaler's condition (a)): the cells on the body's line, the walk's, nearest the pose along its
 * facing first, one paid on an earlier tick and only now cleared among them; then the cells beside
 * the line the bore opened, nearest first. Cells level along the facing keep the walk's order.
 */
export function yieldedInFrontOrder(
  yielded: readonly YieldedCell[],
  paid: readonly TilePoint[],
  pose: VehiclePose,
): YieldedCell[] {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const keyOf = ({ tile }: YieldedCell, at: number) => {
    const dx = tile.tx * MM_PER_METRE + MM_PER_METRE / 2 - pose.x
    const dy = tile.ty * MM_PER_METRE + MM_PER_METRE / 2 - pose.y
    const across = Math.abs(dy * ahead.x - dx * ahead.y)
    return {
      side: across > LINE_HALF_WIDTH_MM * UP_VECTOR_SCALE ? 1 : 0,
      along: dx * ahead.x + dy * ahead.y,
      at,
    }
  }
  return yieldedInWalkOrder(yielded, paid)
    .map((cell, at) => ({ cell, key: keyOf(cell, at) }))
    .sort((a, b) => a.key.side - b.key.side || a.key.along - b.key.along || a.key.at - b.key.at)
    .map(({ cell }) => cell)
}

/** A cell's centre within this of the body's line, across its facing, is on the walk's line. */
const LINE_HALF_WIDTH_MM = MM_PER_METRE / 2
