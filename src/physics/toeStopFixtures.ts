/**
 * One step's let-go stop at the face's toe (ticket 491), for `cutFollowRelease.test.ts`: a body
 * facing right with its wheel line on sample row 40, and ground that is either open or holds a toe
 * the contact rule misses (every sample in its reach under 128, the blend toward a solid sample
 * 300 mm past the face solid inside it). The step runs through `cutTickFor` as the controller does,
 * with the swept cut on or off, the drive pushing or let go, and the cut-follow read the spec gives.
 */
import type { CutFollow } from '../systems/authority/cutFollowRead'
import type { CutTick } from '../systems/vehicle/heldCut'
import type { StepBounds } from '../systems/vehicle/stepBound'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { FACING, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'
import { CELL_KIND } from '../systems/world/worldCell'
import { cutFollowReadFor, cutTickFor, type DrillEngagementInput } from './drillEngagement'

const TOE_POSE: VehiclePose = {
  x: 10_000,
  y: 10_450,
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  facing: FACING.right,
}
const PUSHING: VehicleIntent = { moveX: 1, facing: FACING.right, lift: false }
/** A slow rig's bounds: the in-the-way reach stays 250 mm. */
const STEP_BOUNDS: StepBounds = { cuttingMm: 100, travellingMm: 300 }
/** The last cut followed: 10 m/s to the right. */
const LAST_CUT = { speed: 10, facing: FACING.right }
const TOE_SAMPLES: Readonly<Record<string, number>> = { '42,41': 100, '42,42': 100, '43,42': 255 }

/** How the step is set up. */
export interface ToeStep {
  isSweptCutOn: boolean
  isPushing: boolean
  hasToe: boolean
  isGrounded: boolean
  /** The cut-follow read the authority gives this step. */
  read: CutFollow
}

/** The step's cut, and how many ground samples it read. */
export interface ToeStepOutcome {
  tick: CutTick
  groundReads: number
}

export function stepAtToe(step: ToeStep): ToeStepOutcome {
  let groundReads = 0
  const ground = groundOf(step.hasToe, () => groundReads++)
  const input = inputOf(step)
  const drillPose = { pose: TOE_POSE, isLifting: false }
  const start = {
    read: cutFollowReadFor(input, drillPose, false),
    memory: memoryOf(step.isPushing),
    contact: 'none' as const,
    isCuttingLevel: false,
    isGrounded: step.isGrounded,
  }
  const tick = cutTickFor(input, drillPose, start, ground)
  return { tick, groundReads }
}

function inputOf(step: ToeStep): DrillEngagementInput {
  const intent = step.isPushing ? PUSHING : IDLE_INTENT
  if (!step.isSweptCutOn) return { intent, canAct: true }
  return { intent, canAct: true, cutFollowOf: () => step.read, stepBounds: STEP_BOUNDS }
}

/** A followed cut, still pushed or let go a tick ago. */
function memoryOf(isPushing: boolean) {
  return { followedTicks: 6, last: LAST_CUT, shutTicks: 0, releasedTicks: isPushing ? 0 : 1 }
}

function groundOf(hasToe: boolean, countRead: () => void): GroundReader {
  const densityAt = (sx: number, sy: number) => {
    countRead()
    return hasToe ? (TOE_SAMPLES[`${sx},${sy}`] ?? 0) : 0
  }
  return {
    densityAt,
    densityAtPoint: () => {
      countRead()
      return 0
    },
    materialAt: () => CELL_KIND.ground,
  }
}
