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
 *   first command with a `run` of the count and the step of the tick, the seq and those fields.
 *
 * `expandCommandLog` restores every original command exactly: tick, seq and payload. This is the
 * log's encoding only: the authority and the wire still get every field of every command, so no
 * protocol bump and no sticky state.
 */
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'

type PosePayload = CommandPayloads['reportPose']
type PoseCommand = AuthorityCommand<'reportPose'>

/** A pose line as logged: an absent field means "as this player's previous logged report". */
export type LoggedPosePayload = Partial<PosePayload>

type LoggedPoseCommand = Omit<PoseCommand, 'payload'> & { payload: LoggedPosePayload }

type RunType = 'drillTile' | 'drillStep'
type RunCommand = AuthorityCommand<RunType>

/** How each later command of a run differs from the one before it. */
export interface CommandRunStep {
  /** Commands in the run, the first included: at least 2. */
  count: number
  tick: number
  seq: number
  /** The step of each stepped payload field (`tx, ty` or `x, y`). */
  payload: Readonly<Record<string, number>>
}

type LoggedRunCommand = RunCommand & { run: CommandRunStep }

/** One line of `commands.ndjson`. */
export type LoggedCommand = AuthorityCommand | LoggedPoseCommand | LoggedRunCommand

/** The payload fields a run steps; every other field of its commands is equal. */
const STEPPED_FIELDS: { readonly [T in RunType]: readonly (keyof CommandPayloads[T])[] } = {
  drillTile: ['tx', 'ty'],
  drillStep: ['x', 'y'],
}

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

/** A run being gathered: its first command, the last one added and its step once it has two. */
interface PendingRun {
  first: RunCommand
  last: RunCommand
  count: number
  step: CommandRunStep | null
}

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
  let pending: PendingRun | null = null

  const flush = (): LoggedCommand[] => {
    const lines = pending === null ? [] : [loggedRunOf(pending)]
    pending = null
    return lines
  }

  const startOrWrite = (command: AuthorityCommand): LoggedCommand[] => {
    if (!isRunType(command)) return [loggedCommandOf(command, lastPoses)]
    pending = { first: command, last: command, count: 1, step: null }
    return []
  }

  return {
    writeCommand: (command) => {
      if (pending !== null && extendRun(pending, command)) return []
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
  return logged.flatMap((command) => expandedCommandsOf(command, lastPoses))
}

function isRunType(command: AuthorityCommand): command is RunCommand {
  return Object.hasOwn(STEPPED_FIELDS, command.type)
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

/**
 * Adds `command` to the run when it continues it: the same player and type, the step of the run
 * (or, as the second command, any step), and every unstepped field equal.
 */
function extendRun(run: PendingRun, command: AuthorityCommand): boolean {
  if (command.type !== run.last.type || command.playerId !== run.last.playerId) return false
  const step = stepBetween(run.last, command as RunCommand)
  if (step === null || (run.step !== null && !isSameStep(run.step, step))) return false
  run.last = command as RunCommand
  run.count += 1
  run.step = { ...step, count: run.count }
  return true
}

/** How `next` differs from `last`, or null when an unstepped field differs. */
function stepBetween(last: RunCommand, next: RunCommand): CommandRunStep | null {
  const stepped = STEPPED_FIELDS[last.type] as readonly string[]
  const lastPayload = last.payload as unknown as Record<string, unknown>
  const nextPayload = next.payload as unknown as Record<string, unknown>
  if (!isSameUnsteppedPayload(lastPayload, nextPayload, stepped)) return null
  const payload = Object.fromEntries(
    stepped.map((field) => [
      field,
      (nextPayload[field] as number) - (lastPayload[field] as number),
    ]),
  )
  return { count: 2, tick: next.tick - last.tick, seq: next.seq - last.seq, payload }
}

function isSameUnsteppedPayload(
  last: Record<string, unknown>,
  next: Record<string, unknown>,
  stepped: readonly string[],
): boolean {
  const unstepped = Object.keys(next).filter((field) => !stepped.includes(field))
  const hasSameFields = Object.keys(last).length === Object.keys(next).length
  return hasSameFields && unstepped.every((field) => isSameValue(last[field], next[field]))
}

function isSameValue(last: unknown, next: unknown): boolean {
  return JSON.stringify(last) === JSON.stringify(next)
}

function isSameStep(run: CommandRunStep, step: CommandRunStep): boolean {
  return run.tick === step.tick && run.seq === step.seq && isSameValue(run.payload, step.payload)
}

function loggedRunOf({ first, step }: PendingRun): LoggedCommand {
  return step === null ? first : { ...first, run: step }
}

function expandedCommandsOf(command: LoggedCommand, lastPoses: LastPoses): AuthorityCommand[] {
  forgetPoseOnRescue(command, lastPoses)
  if ('run' in command) return unrolledRunOf(command)
  if (command.type !== 'reportPose') return [command as AuthorityCommand]
  return [expandedPoseOf(command as LoggedPoseCommand, lastPoses)]
}

function expandedPoseOf(command: LoggedPoseCommand, lastPoses: LastPoses): PoseCommand {
  const payload = { ...lastPoses.get(command.playerId), ...command.payload }
  refuseIncompletePose(command, payload)
  lastPoses.set(command.playerId, payload as PosePayload)
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

function unrolledRunOf({ run, ...first }: LoggedRunCommand): AuthorityCommand[] {
  return Array.from({ length: run.count }, (_, index) => steppedCommandOf(first, run, index))
}

function steppedCommandOf(first: RunCommand, run: CommandRunStep, index: number): RunCommand {
  const payload = { ...first.payload } as Record<string, unknown>
  for (const [field, step] of Object.entries(run.payload)) {
    payload[field] = (payload[field] as number) + step * index
  }
  return {
    ...first,
    tick: first.tick + run.tick * index,
    seq: first.seq + run.seq * index,
    payload,
  } as RunCommand
}
