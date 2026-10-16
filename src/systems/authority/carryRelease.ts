/**
 * When the swept cut's carry lets the stamp carve its cell (ticket 421, the TD's root cause on #400
 * and the GD ruling on #421 Q2). The carry's cell is cut by the carry alone (`sweptCarry.ts`), so on
 * a level cut the wheel-row cell it works toward kept its low samples, a lip at the body's lower
 * front. Once one of the cell's samples lies in the body's next-step slab it is released: the stamp
 * carves it as any other cell, still asking its gates as it meets it.
 *
 * - **Paid on the tick the walk meets it** (rule (b), GD ruling 6204353563, TD shape 6204362873):
 *   the walk prices a released cell again after the stamp's bite up to it, and pays it then when
 *   the work left covers that (`vehicle/carryWalk.ts`), so the stamp is not held back a tick.
 * - **No double count**: the carry banked against a released cell is clamped to what the stamp left
 *   of it, re-priced; the surplus is discarded, never banked forward (as a stop discards work). The
 *   cell is never paid less than its remaining density takes.
 * - Nothing here cuts below the stamp's level floor or adds a clearing rule: the stamp's floor stays
 *   what the body rides on.
 */
import { BODY_HALF_SIZE_MM, CARRY_RELEASE_MARGIN_SAMPLES } from '../../constants/balance'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import type { CarryGround, CarryReach } from '../vehicle/carryWalk'
import { sweptStampOf, type SweepPath } from '../vehicle/sweptCut'
import { facingVectorOf, type IntegerVector, type VehiclePose } from '../vehicle/vehiclePose'
import { carveDisc, type CellDrillTicks } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import { MM_PER_SAMPLE, SAMPLES_PER_TILE } from '../world/sampleGrid'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import type { DrillCarveRequest } from './drillGearCut'
import type { DrillGates } from './drillGates'
import { carryGroundOf, ungatedPriceOf } from './sweptCarry'

/** The body's next step along its facing, in mm times `UP_VECTOR_SCALE` from its centre. */
interface NextStepSlab {
  pose: VehiclePose
  facing: IntegerVector
  nearest: number
  furthest: number
  halfWidth: number
}

/**
 * The carry's cell while the stamp must leave it standing; null once released, or with no carry.
 * `cuttingMm` is the step the rig may take next while it cuts (`stepBoundRead.ts`).
 */
export function heldCarryCellOf(
  target: TilePoint | null,
  pose: VehiclePose,
  cuttingMm: number,
): TilePoint | null {
  if (target === null) return null
  return hasSampleInSlab(target, nextStepSlabOf(pose, cuttingMm)) ? null : target
}

function nextStepSlabOf(pose: VehiclePose, cuttingMm: number): NextStepSlab {
  const margin = CARRY_RELEASE_MARGIN_SAMPLES * MM_PER_SAMPLE
  return {
    pose,
    facing: facingVectorOf(pose.upx, pose.upy, pose.facing),
    nearest: BODY_HALF_SIZE_MM * UP_VECTOR_SCALE,
    furthest: (BODY_HALF_SIZE_MM + cuttingMm + margin) * UP_VECTOR_SCALE,
    halfWidth: (BODY_HALF_SIZE_MM + margin) * UP_VECTOR_SCALE,
  }
}

/** Whether any of the cell's density samples lies inside the slab. */
function hasSampleInSlab({ tx, ty }: TilePoint, slab: NextStepSlab): boolean {
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      const xMm = (tx * SAMPLES_PER_TILE + qx) * MM_PER_SAMPLE
      const yMm = (ty * SAMPLES_PER_TILE + qy) * MM_PER_SAMPLE
      if (isInSlab(xMm, yMm, slab)) return true
    }
  }
  return false
}

function isInSlab(xMm: number, yMm: number, slab: NextStepSlab): boolean {
  const { pose, facing } = slab
  const dx = xMm - pose.x
  const dy = yMm - pose.y
  const ahead = dx * facing.x + dy * facing.y
  const across = Math.abs(dy * facing.x - dx * facing.y)
  return isWithin(ahead, slab.nearest, slab.furthest) && across <= slab.halfWidth
}

function isWithin(value: number, low: number, high: number): boolean {
  return value >= low && value <= high
}

/**
 * A tick's reach, the cell its carry kept out of the stamp, the world the stamp left, and the
 * command's gates as the carve asked them.
 */
export interface ReleasedReach {
  reach: CarryReach
  held: TilePoint | null
  world: WorldState
  gates: DrillGates
}

/**
 * The reach with a released cell's carry clamped to what the stamp left of it, re-priced; the
 * surplus is discarded. A carry toward a cell the tick's carve reported standing at a gate is
 * discarded whole, never banked toward or past a gate (ticket 421 shape item 4). A held cell's
 * carry, or none, is otherwise left as the walk banked it.
 */
export function carryClampedToRelease(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { reach, held, world, gates }: ReleasedReach,
): CarryReach {
  if (reach.target === null) return reach
  if (isReportedStanding(gates, reach.target)) return { ...reach, carrySubSteps: 0 }
  if (held !== null) return reach
  const left = ungatedPriceOf(state, params, playerId, { tile: reach.target, world })
  return { ...reach, carrySubSteps: Math.min(reach.carrySubSteps, left) }
}

/** Whether the command's gates already reported the cell refused or blocked (no gate is asked). */
function isReportedStanding(gates: DrillGates, { tx, ty }: TilePoint): boolean {
  return gates.refusedEvents().some((event) => isEventAt(event, tx, ty))
}

function isEventAt(event: DomainEventBody, tx: number, ty: number): boolean {
  return 'tx' in event && event.tx === tx && event.ty === ty
}

/** The walk's paid cells, then its released cell: the order the sweep crosses them. */
export function crossedInWalkOrder(
  { paid, target }: CarryReach,
  held: TilePoint | null,
): readonly TilePoint[] {
  return target === null || held !== null ? paid : [...paid, target]
}

/** The sweep a walk releases cells along: its path and stamp, and the body's next step. */
export interface ReleasingSweep {
  path: SweepPath
  stamp: DiscStamp
  step: { pose: VehiclePose }
  /** The step the rig may take next while it cuts (`stepBoundRead.ts`). */
  cuttingMm: number
}

/** A crossed cell, and the sub-step where the stamp's centre enters it. */
interface CellCrossing {
  tile: TilePoint
  step: number
}

/**
 * The carve request read as the carry walk's ground, a released cell priced again after the
 * stamp's bite up to it.
 */
export function releasingCarryGround(
  params: PlanetParams,
  request: DrillCarveRequest,
  sweep: ReleasingSweep,
): CarryGround {
  return {
    ...carryGroundOf(params, request),
    releasedPriceAt: (tile, step) => releasedPriceOf(params, request, sweep, { tile, step }),
  }
}

/** What the stamp's bite leaves of a crossed cell the body's next step reaches; null while held. */
function releasedPriceOf(
  params: PlanetParams,
  request: DrillCarveRequest,
  sweep: ReleasingSweep,
  crossing: CellCrossing,
): number | null {
  const { pose } = sweep.step
  if (heldCarryCellOf(crossing.tile, pose, sweep.cuttingMm) !== null) return null
  const world = stampBiteOf(params, request, sweep, crossing)
  return carryGroundOf(params, { ...request, world }).cellAt(crossing.tile).price
}

/**
 * The world once the stamp, reaching the sub-step before the crossing, carves the crossed cell
 * alone: no other cell is carved or asked its gates, so no gate is reported out of the order the
 * tick's own carve meets it. The drill gear is left out, so a cell is never priced under what the
 * stamp leaves.
 */
function stampBiteOf(
  params: PlanetParams,
  request: DrillCarveRequest,
  { path, stamp }: ReleasingSweep,
  { tile, step }: CellCrossing,
): WorldState {
  const disc = sweptStampOf(path, stamp, step - 1)
  const drillTicksOf = cellAloneOf(request.gates.drillTicksOf, tile)
  return carveDisc(request.world, params, disc, request.window, drillTicksOf).world
}

/** `drillTicksOf` for `cell`; null, not drillable, for every other cell. */
function cellAloneOf(drillTicksOf: CellDrillTicks, cell: TilePoint): CellDrillTicks {
  return (tile, material, casingGrade) =>
    tile.tx === cell.tx && tile.ty === cell.ty ? drillTicksOf(tile, material, casingGrade) : null
}
