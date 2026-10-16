/**
 * A run of one player's pose reports in `commands.ndjson` (ticket 522, the TD shape on #514):
 * while the drill bites the shell reports every tick, and each later report of a run differs from
 * the one before only in `x, y, vx, vy`. The run is the first report's line with one
 * `[rx, ry, dvx, dvy]` per later report: the next tick and the player's next seq; its velocity is
 * the previous one plus `dvx, dvy`; its position is the previous one moved a tick at that
 * velocity, rounded to the mm, plus the residual `rx, ry`. Every value is a safe integer and the
 * reader runs the same predictor, so each report comes back exactly; nothing is quantised.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'

type PosePayload = CommandPayloads['reportPose']
type PoseCommand = AuthorityCommand<'reportPose'>

/** How a run's next report differs from the one before: position residual, velocity change. */
export type PoseResidual = readonly [rx: number, ry: number, dvx: number, dvy: number]

/** The fields a run steps; any other field that changes ends the run. */
const RUN_FIELDS = ['x', 'y', 'vx', 'vy'] as const

/** Whether `next` is `last`'s player's report on the very next tick and seq. */
export function isNextTickPose(last: PoseCommand, next: AuthorityCommand): next is PoseCommand {
  const isSamePlayerPose = next.type === 'reportPose' && next.playerId === last.playerId
  return isSamePlayerPose && next.seq === last.seq + 1 && next.tick === last.tick + 1
}

/** `next` as a residual on `last`, or null when another field changed or a value is not an integer. */
export function poseResidualOf(last: PosePayload, next: PosePayload): PoseResidual | null {
  if (!isSameUnsteppedPose(last, next) || !hasIntegerMotion(next)) return null
  const residual: PoseResidual = [
    next.x - predictedAxisOf(last.x, next.vx),
    next.y - predictedAxisOf(last.y, next.vy),
    next.vx - last.vx,
    next.vy - last.vy,
  ]
  return residual.every(Number.isSafeInteger) ? residual : null
}

/** The report after `last` that `residual` encodes: the reader's half of the predictor. */
export function poseAfterResidual(
  last: PosePayload,
  [rx, ry, dvx, dvy]: PoseResidual,
): PosePayload {
  const vx = last.vx + dvx
  const vy = last.vy + dvy
  return {
    ...last,
    x: predictedAxisOf(last.x, vx) + rx,
    y: predictedAxisOf(last.y, vy) + ry,
    vx,
    vy,
  }
}

/** Where a tick at `velocity` mm/s takes `position` mm, rounded to the mm (semi-implicit Euler). */
function predictedAxisOf(position: number, velocity: number): number {
  return position + Math.round(velocity / TICKS_PER_SECOND)
}

function isSameUnsteppedPose(last: PosePayload, next: PosePayload): boolean {
  const fields = Object.keys(next) as (keyof PosePayload)[]
  const unstepped = fields.filter((field) => !(RUN_FIELDS as readonly string[]).includes(field))
  const hasSameFields = Object.keys(last).length === fields.length
  return hasSameFields && unstepped.every((field) => isSameValue(last[field], next[field]))
}

function isSameValue(last: unknown, next: unknown): boolean {
  return JSON.stringify(last) === JSON.stringify(next)
}

function hasIntegerMotion(pose: PosePayload): boolean {
  return RUN_FIELDS.every((field) => Number.isSafeInteger(pose[field]))
}

/** `first` and the reports its run's residuals encode, a tick and a seq apart. */
export function unrolledPoseRunOf(
  first: PoseCommand,
  residuals: readonly PoseResidual[],
): PoseCommand[] {
  const poses = [first]
  for (const residual of residuals) poses.push(poseAfter(poses[poses.length - 1], residual))
  return poses
}

function poseAfter(last: PoseCommand, residual: PoseResidual): PoseCommand {
  return {
    ...last,
    tick: last.tick + 1,
    seq: last.seq + 1,
    payload: poseAfterResidual(last.payload, residual),
  }
}
