/**
 * `commands.ndjson` as written: the replay input (#11 section 3), so it is re-encoded losslessly,
 * never aggregated away (ticket 420, the TD spec on #396 section 1, extending ticket 342's `drive`
 * rule, the TD call on #123):
 *
 * - A `reportPose` line leaves out every payload field equal to the same player's previous logged
 *   report, and reading the log carries the last value forward. Most 5 Hz pose lines are idle, so
 *   they shrink to their stamp. A player's first report, and the first after a rescue (respawn),
 *   is written in full, so a reader never needs a value from before that point.
 * - Consecutive `drillTile` commands of one player with equal `ticks` and a constant tile step,
 *   or `drillStep` commands with a constant `x, y` step and equal `drive`, are written as their
 *   first command with a `run` of the count and the step of the tick and those fields; its
 *   commands take the player's next seqs in turn. The player's pose reports between them (the
 *   shell's 5 Hz, the bot's report before each bore) do not end the run: their lines follow the
 *   run's, and the reader puts them back by seq, which is exact within one player.
 * - Consecutive `reportPose` commands of one player a tick and a seq apart that differ only in
 *   `x, y, vx, vy` (the shell's report every tick while the drill bites) are written as the first
 *   one's line with a `poseRun` of one integer residual per later report (`poseRunLine.ts`,
 *   ticket 522). A report where any other field changes ends the run and starts its own line.
 *
 * `expandCommandLog` restores every original command exactly: tick, seq and payload. This is the
 * log's encoding only: the authority and the wire still get every field of every command, so no
 * protocol bump and no sticky state.
 */
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'
import {
  extendRun,
  heldPoseCountOf,
  isRunType,
  linesOfRun,
  startDrillRun,
  unrolledRunOf,
  type LoggedRunCommand,
  type PendingRun,
} from './drillRunLine'
import { isNextTickPose, poseResidualOf, unrolledPoseRunOf, type PoseResidual } from './poseRunLine'

type PosePayload = CommandPayloads['reportPose']
type PoseCommand = AuthorityCommand<'reportPose'>

/** A pose line as logged: an absent field means "as this player's previous logged report". */
export type LoggedPosePayload = Partial<PosePayload>

/** A pose line as logged; a `poseRun` holds the reports on the ticks after it (ticket 522). */
type LoggedPoseCommand = Omit<PoseCommand, 'payload'> & {
  payload: LoggedPosePayload
  poseRun?: PoseResidual[]
}

/** One line of `commands.ndjson`. */
export type LoggedCommand = AuthorityCommand | LoggedPoseCommand | LoggedRunCommand

/** Every pose field, so a full line can be told from one that leans on an earlier report. */
const POSE_FIELDS = Object.keys({
  x: true,
  y: true,
  vx: true,
  vy: true,
  upx: true,
  upy: true,
  facing: true,
  driving: true,
  thrusting: true,
  drilling: true,
  thrustTicks: true,
  driveTicks: true,
  drillTicks: true,
  drive: true,
} satisfies Record<keyof PosePayload, true>) as (keyof PosePayload)[]

/** The last pose each player logged; a rescue forgets it so the next report is written in full. */
type LastPoses = Map<string, PosePayload>

/** A pose run being gathered: the first report's logged line, the last report, the residuals. */
interface PendingPoseRun {
  kind: 'pose'
  line: LoggedPoseCommand
  last: PoseCommand
  residuals: PoseResidual[]
}

type Pending = PendingRun | PendingPoseRun

/**
 * Turns submitted commands into log lines in order, remembering each player's last pose and the
 * run being gathered: a command extending a run completes no line until the run ends.
 */
export interface CommandLogWriter {
  /** The lines `command` completes, in order. */
  writeCommand(command: AuthorityCommand): LoggedCommand[]
  /** The line of the run being gathered, if any: at each flush and at the end of a list. */
  flush(): LoggedCommand[]
}

export function createCommandLogWriter(): CommandLogWriter {
  const lastPoses: LastPoses = new Map()
  let pending: Pending | null = null

  const flush = (): LoggedCommand[] => {
    const lines = pending === null ? [] : linesOfPending(pending)
    pending = null
    return lines
  }

  const startOrWrite = (command: AuthorityCommand): LoggedCommand[] => {
    pending = pendingOf(command, lastPoses)
    return pending === null ? [loggedCommandOf(command, lastPoses)] : []
  }

  return {
    writeCommand: (command) => {
      if (pending !== null && gatherIntoPending(pending, command, lastPoses)) return []
      return [...flush(), ...startOrWrite(command)]
    },
    flush,
  }
}

/** A whole command list as `commands.ndjson` holds it. */
export function loggedCommandsOf(commands: readonly AuthorityCommand[]): LoggedCommand[] {
  const writer = createCommandLogWriter()
  return [...commands.flatMap(writer.writeCommand), ...writer.flush()]
}

/** The commands a log holds, every field carried forward and every run unrolled: the replay input. */
export function expandCommandLog(logged: readonly LoggedCommand[]): AuthorityCommand[] {
  const lastPoses: LastPoses = new Map()
  const expanded: AuthorityCommand[] = []
  for (let at = 0; at < logged.length; at += 1 + heldPoseCountOf(logged[at])) {
    for (const command of expandedLinesAt(logged, at, lastPoses)) expanded.push(command)
  }
  return expanded
}

/** The run `command` starts: a pose run from each pose, a drill run from each drill command. */
function pendingOf(command: AuthorityCommand, lastPoses: LastPoses): Pending | null {
  if (command.type === 'reportPose') return startPoseRun(command as PoseCommand, lastPoses)
  return isRunType(command) ? startDrillRun(command) : null
}

function startPoseRun(command: PoseCommand, lastPoses: LastPoses): PendingPoseRun {
  const line = loggedCommandOf(command, lastPoses) as LoggedPoseCommand
  return { kind: 'pose', line, last: command, residuals: [] }
}

function gatherIntoPending(run: Pending, command: AuthorityCommand, lastPoses: LastPoses): boolean {
  if (run.kind === 'pose') return extendPoseRun(run, command, lastPoses)
  return gatherIntoRun(run, command, lastPoses)
}

/** Adds `command` to the pose run when it is the next tick's report and only its motion changed. */
function extendPoseRun(
  run: PendingPoseRun,
  command: AuthorityCommand,
  lastPoses: LastPoses,
): boolean {
  if (!isNextTickPose(run.last, command)) return false
  const residual = poseResidualOf(run.last.payload, command.payload)
  if (residual === null) return false
  run.residuals.push(residual)
  run.last = command
  lastPoses.set(command.playerId, command.payload)
  return true
}

function linesOfPending(run: Pending): LoggedCommand[] {
  if (run.kind === 'drill') return linesOfRun(run)
  return [run.residuals.length === 0 ? run.line : { ...run.line, poseRun: run.residuals }]
}

function loggedCommandOf(command: AuthorityCommand, lastPoses: LastPoses): LoggedCommand {
  forgetPoseOnRescue(command, lastPoses)
  if (command.type !== 'reportPose') return command
  const last = lastPoses.get(command.playerId)
  lastPoses.set(command.playerId, command.payload)
  return { ...command, payload: changedPoseFieldsOf(last, command.payload) }
}

function changedPoseFieldsOf(last: PosePayload | undefined, pose: PosePayload): LoggedPosePayload {
  if (last === undefined) return pose
  const changed = POSE_FIELDS.filter((field) => !isSamePoseField(last[field], pose[field]))
  return Object.fromEntries(changed.map((field) => [field, pose[field]])) as LoggedPosePayload
}

function isSamePoseField(last: PosePayload[keyof PosePayload], value: typeof last): boolean {
  if (typeof last !== 'object' || typeof value !== 'object') return last === value
  return last.x === value.x && last.y === value.y
}

function forgetPoseOnRescue(command: LoggedCommand, lastPoses: LastPoses): void {
  if (command.type === 'requestRescue') lastPoses.delete(command.playerId)
}

/** Holds the player's pose for after the run, or adds `command` to the run when it continues it. */
function gatherIntoRun(run: PendingRun, command: AuthorityCommand, lastPoses: LastPoses): boolean {
  if (!isPoseOfRunPlayer(run, command)) return extendRun(run, command)
  run.poses.push(loggedCommandOf(command, lastPoses))
  run.posesSinceLast += 1
  return true
}

function isPoseOfRunPlayer(run: PendingRun, command: AuthorityCommand): boolean {
  return command.type === 'reportPose' && command.playerId === run.first.playerId
}

/** The line at `at` expanded, with the pose lines its run held put back among its commands. */
function expandedLinesAt(
  logged: readonly LoggedCommand[],
  at: number,
  lastPoses: LastPoses,
): AuthorityCommand[] {
  const held = logged.slice(at + 1, at + 1 + heldPoseCountOf(logged[at]))
  const commands = expandedCommandsOf(logged[at], lastPoses, new Set(held.map(({ seq }) => seq)))
  if (held.length === 0) return commands
  const poses = held.flatMap((line) => expandedCommandsOf(line, lastPoses))
  return [...commands, ...poses].sort((a, b) => a.seq - b.seq)
}

function expandedCommandsOf(
  command: LoggedCommand,
  lastPoses: LastPoses,
  heldSeqs: ReadonlySet<number> = new Set(),
): AuthorityCommand[] {
  forgetPoseOnRescue(command, lastPoses)
  if ('run' in command) return unrolledRunOf(command, heldSeqs)
  if (command.type !== 'reportPose') return [command as AuthorityCommand]
  return expandedPosesOf(command as LoggedPoseCommand, lastPoses)
}

/** A pose line's report and, for a pose run, the reports on the ticks after it. */
function expandedPosesOf(
  { poseRun = [], ...command }: LoggedPoseCommand,
  lastPoses: LastPoses,
): PoseCommand[] {
  const poses = unrolledPoseRunOf(expandedPoseOf(command, lastPoses), poseRun)
  lastPoses.set(command.playerId, poses[poses.length - 1].payload)
  return poses
}

function expandedPoseOf(command: LoggedPoseCommand, lastPoses: LastPoses): PoseCommand {
  const payload = { ...lastPoses.get(command.playerId), ...command.payload }
  refuseIncompletePose(command, payload)
  return { ...command, payload: payload as PosePayload }
}

/** A line missing a field with nothing to carry is a broken log: refused, never guessed. */
function refuseIncompletePose(command: LoggedPoseCommand, payload: LoggedPosePayload): void {
  const missing = POSE_FIELDS.filter((field) => payload[field] === undefined)
  if (missing.length === 0) return
  throw new Error(
    `commands.ndjson: reportPose at tick ${command.tick} seq ${command.seq} of ` +
      `${command.playerId} has no ${missing.join(', ')} and no earlier one to carry forward`,
  )
}
