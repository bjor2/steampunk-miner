/**
 * How a swept tick carves (tickets 330, 399, 421 and 570), split from `sweptDrill.ts`: the carry
 * walk (`vehicle/carryWalk.ts`) decides how far the work reaches, then the stamp carves that far,
 * by one of two rules picked by the cut gate the step read (`cutGate.ts`):
 *
 * - **Cutting** (the gate open, the drill setting the speed): the cut rides its front (ticket 570,
 *   the TD shape on #570). The stamp sits where the body's face will be after this tick's step
 *   (`sweptStampAheadMmOf`) and lowers each sample once, as its front crosses it
 *   (`world/cutFront.ts`), so the face moves with the body and no cell vanishes in one frame. A paid
 *   cell is cleared as the front passes it, and where the work falls short of a cell the front bites
 *   into it as far as the work pays (`sweptFront.ts`).
 * - **Travelling** (the gate shut, travel setting the speed through ground mostly cut): the stamp
 *   sits a cutting step ahead, as the body may cover more than the drill's step. It carves over its
 *   drill time, a paid cell is cleared in full, and the cell the carry works toward stays standing
 *   until the body's next step reaches it (ticket 421, `carryRelease.ts`).
 */
import { walkedWithBit, type DrillCarveRequest } from './drillGearCut'
import type { DrillBit } from '../vehicle/aheadBearingLatch'
import type { CarryGround, CarryReach, CarryWalk } from '../vehicle/carryWalk'
import { pointAtStep, sweptStampTo } from '../vehicle/sweptCut'
import type { PlanetParams } from '../world/planetParams'
import { clearingPaidCellsFirst } from '../world/paidCellClear'
import type { StampPoint } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import {
  carryClampedToRelease,
  crossedInWalkOrder,
  heldCarryCellOf,
  releasingCarryGround,
} from './carryRelease'
import { cutCellsWithin } from './cutShare'
import { carveStampWithRead, drillGearReadAt, type DrillCarve } from './drillGearCut'
import { carryPurseOf, carrySweepOf, leavingCellToCarry, yieldedInWalkOrder } from './sweptCarry'
import {
  cutFrontAt,
  frontGroundOf,
  sweptFrontOf,
  windowAtFront,
  yieldedInFrontOrder,
  type SweptFront,
} from './sweptFront'
import type { Sweep, SweepWalks, SweptCarve } from './sweptDrill'

/** A sweep and the drill command's carve request. */
export interface SweepRequest {
  sweep: Sweep
  request: DrillCarveRequest
}

/** Who carves, and how the tick is walked. */
export interface CarveBy {
  state: AuthorityState
  params: PlanetParams
  playerId: string
  walks: SweepWalks
}

/** A tick cutting with the gate open: the walk pays, the front bites, the stamp carves to it. */
export function carveSweepToFront(by: CarveBy, cut: SweepRequest): SweptCarve {
  const { path, stamp, rear, crossed, step } = cut.sweep
  const frontSweep = { path, stamp, rear, crossed, pose: step.pose, request: cut.request }
  const ground = frontGroundOf(by.params, frontSweep)
  const reach = reachOfWork(by, cut, ground)
  if (reach.reachedStep < 0) return emptyCarveOf(cut.request.world, reach.carrySubSteps)
  const front = frontOfReach(by.params, cut, reach)
  const read = drillGearReadAt(
    by.state,
    by.params,
    by.playerId,
    bitAt(cut.sweep, front.point),
    cut.request.gates,
  )
  const bit = bitFromBodyAt(cut.sweep, front.point)
  const cells = cutCellsWithin(bit.disc, read, cut.sweep.share)
  const atFront = { ...cut.request, window: frontWindowOf(cut, front) }
  const walk = stampWalkOf(by, cut, reach, cells)
  const carved = carveStampWithRead(by.params, bit, read, atFront, walk)
  const frontReach = { ...reach, carrySubSteps: front.carrySubSteps }
  const reached = withReach(carved, { reach: frontReach, held: null }, cells)
  return {
    ...reached,
    yielded: yieldedInFrontOrder(carved.yielded, reach.paid, cut.sweep.step.pose),
    ...frontPastReachOf(front.point, pointAtStep(cut.sweep.path, Math.max(0, reach.reachedStep))),
  }
}

/** The front's key when a bite left it off the walk's reach; nothing when it stands there. */
function frontPastReachOf(front: StampPoint, reached: StampPoint): { front?: StampPoint } {
  const isAtReach = front.xMm === reached.xMm && front.yMm === reached.yMm
  return isAtReach ? {} : { front }
}

/**
 * The bit a cutting tick carves with: the capsule from the body to the front (ticket 570), so the
 * ground between them is cut however the body moved off the line the cursor left (a cut started
 * mid-fall); what earlier ticks cut there is left as it is. The drill gear reads the walk's bit.
 */
function bitFromBodyAt({ step, stamp, rear }: Sweep, front: StampPoint): DrillBit {
  return { pose: step.pose, disc: { ...stamp, ...front, tail: rear }, drive: step.drive }
}

/**
 * A tick travelling with the gate shut: as far as its work reaches, its paid cells cleared in
 * full, the carry's cell held out of the stamp until released (ticket 421).
 */
export function carveSweepAheadOfTravel(by: CarveBy, cut: SweepRequest): SweptCarve {
  const { state, params, playerId } = by
  const { sweep, request } = cut
  const reach = reachOfWork(by, cut, releasingCarryGround(params, request, sweep))
  if (reach.reachedStep < 0) return emptyCarveOf(request.world, reach.carrySubSteps)
  const bit = bitAt(sweep, pointAtStep(sweep.path, reach.reachedStep))
  const read = drillGearReadAt(state, params, playerId, bit, request.gates)
  const cells = cutCellsWithin(bit.disc, read, sweep.share)
  const held = heldCarryCellOf(reach.target, sweep.step.pose, sweep.cuttingMm)
  const stampWalk = by.walks.stampOf({ sweep, request, clear: reach.reachedStep, cells })
  const carved = carveStampWithRead(
    params,
    bit,
    read,
    leavingCellToCarry(request, held),
    walkedWithBit(clearingPaidCellsFirst(reach.paid, stampWalk)),
  )
  const clamped = carryClampedToRelease(state, params, playerId, {
    reach,
    held,
    world: carved.world,
    gates: request.gates,
  })
  return withReach(carved, { reach: clamped, held }, cells)
}

/** How far the tick's work and carry reach along the sweep over `ground`. */
function reachOfWork(
  by: CarveBy,
  { sweep, request }: SweepRequest,
  ground: CarryGround,
): CarryReach {
  const { state, params, playerId } = by
  const walk: CarryWalk = by.walks.carryOf(sweep)
  const purse = carryPurseOf(state, playerId, sweep)
  const path = { path: sweep.path, pose: sweep.step.pose, world: request.world }
  return walk(carrySweepOf(state, params, playerId, path), purse, ground)
}

/** Where the tick's front stands once the walk has paid what it can (`sweptFront.ts`). */
function frontOfReach(params: PlanetParams, cut: SweepRequest, reach: CarryReach): SweptFront {
  const { path, stamp, rear, crossed, step } = cut.sweep
  const front = { path, stamp, rear, crossed, pose: step.pose, request: cut.request, reach }
  return sweptFrontOf(params, front)
}

function frontWindowOf({ sweep, request }: SweepRequest, front: SweptFront) {
  const { rear, crossed, stamp } = sweep
  const place = { pose: sweep.step.pose, point: front.point, rear, crossed, stamp }
  return windowAtFront(request.window, cutFrontAt(place))
}

/** The tick's stamp walk, the bit's gear cells cut with it. */
function stampWalkOf(by: CarveBy, cut: SweepRequest, reach: CarryReach, cells: number) {
  return walkedWithBit(by.walks.stampOf({ ...cut, clear: reach.reachedStep, cells }))
}

/** The drill bit with its stamp's centre at `centre`. */
function bitAt({ step, path, stamp }: Sweep, centre: StampPoint): DrillBit {
  return { pose: step.pose, disc: sweptStampTo(path, stamp, centre), drive: step.drive }
}

/** The walk's reach, and the cell its carry kept out of the stamp (null once released). */
interface HeldReach {
  reach: CarryReach
  held: TilePoint | null
}

/**
 * The carve with the walk's reach and carry, its paid cells and then a released cell yielding
 * first, in walk order.
 */
function withReach(carved: DrillCarve, { reach, held }: HeldReach, cells: number): SweptCarve {
  return {
    ...carved,
    yielded: yieldedInWalkOrder(carved.yielded, crossedInWalkOrder(reach, held)),
    reachedStep: reach.reachedStep,
    cells,
    carrySubSteps: reach.carrySubSteps,
    paid: reach.paid,
    paidPrices: reach.paidPrices,
    carryTarget: reach.target,
  }
}

function emptyCarveOf(world: WorldState, carrySubSteps: number): SweptCarve {
  return {
    world,
    changes: [],
    yielded: [],
    ticksUsed: 0,
    casingCleared: { samples: 0, grade: 0 },
    lawWork: 0,
    gearQuanta: 0,
    gearTicksUsed: 0,
    lawWorkBp: 0,
    gearCells: [],
    aheadLatch: null,
    sideLatch: null,
    reachedStep: -1,
    cells: 0,
    carrySubSteps,
    paid: [],
    paidPrices: [],
    carryTarget: null,
  }
}
