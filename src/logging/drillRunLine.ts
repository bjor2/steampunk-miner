/**
 * A run of one player's drill commands in `commands.ndjson` (ticket 420): consecutive `drillTile`
 * commands with equal `ticks` and a constant tile step, or `drillStep` commands with a constant
 * `x, y` step and equal `drive`, are one line, their first command with a `run` of the count and
 * the step. The player's pose lines sent between them follow the run's line, and its commands
 * take the seqs those lines leave free. `commandLog.ts` decides when a run is gathered and written.
 */
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'
import type { LoggedCommand } from './commandLog'

export type RunType = 'drillTile' | 'drillStep'
export type RunCommand = AuthorityCommand<RunType>

/** How each later command of a run differs from the one before it. */
export interface CommandRunStep {
  /** Commands in the run, the first included: at least 2. */
  count: number
  tick: number
  /** The step of each stepped payload field (`tx, ty` or `x, y`). */
  payload: Readonly<Record<string, number>>
  /**
   * The player's pose lines sent between the run's commands, written right after its line; the
   * run's commands take the seqs those lines leave free.
   */
  poses?: number
}

export type LoggedRunCommand = RunCommand & { run: CommandRunStep }

/** The payload fields a run steps; every other field of its commands is equal. */
const STEPPED_FIELDS: { readonly [T in RunType]: readonly (keyof CommandPayloads[T])[] } = {
  drillTile: ['tx', 'ty'],
  drillStep: ['x', 'y'],
}

/**
 * A run being gathered: its first command, the last one added, its step once it has two, and the
 * logged lines of the player's poses sent since it started.
 */
export interface PendingRun {
  kind: 'drill'
  first: RunCommand
  last: RunCommand
  count: number
  step: CommandRunStep | null
  poses: LoggedCommand[]
  posesSinceLast: number
}

/** The run `command` starts, waiting for a second command to give it a step. */
export function startDrillRun(command: RunCommand): PendingRun {
  return {
    kind: 'drill',
    first: command,
    last: command,
    count: 1,
    step: null,
    poses: [],
    posesSinceLast: 0,
  }
}

export function isRunType(command: AuthorityCommand): command is RunCommand {
  return Object.hasOwn(STEPPED_FIELDS, command.type)
}

/**
 * Adds `command` to the run when it continues it: the same player and type, the player's next seq
 * after the poses held since the last, the step of the run (or, as the second command, any step),
 * and every unstepped field equal.
 */
export function extendRun(run: PendingRun, command: AuthorityCommand): boolean {
  if (!isNextOfRun(run, command)) return false
  const step = stepBetween(run.last, command as RunCommand)
  if (step === null || (run.step !== null && !isSameStep(run.step, step))) return false
  run.last = command as RunCommand
  run.count += 1
  run.step = { ...step, count: run.count }
  run.posesSinceLast = 0
  return true
}

function isNextOfRun({ last, posesSinceLast }: PendingRun, command: AuthorityCommand): boolean {
  const isSameKind = command.type === last.type && command.playerId === last.playerId
  return isSameKind && command.seq === last.seq + 1 + posesSinceLast
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
  return { count: 2, tick: next.tick - last.tick, payload }
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
  return run.tick === step.tick && isSameValue(run.payload, step.payload)
}

/** A lone command and its poses as they came; a run as one line, then the poses it held. */
export function linesOfRun({ first, step, poses }: PendingRun): LoggedCommand[] {
  if (step === null) return [first, ...poses]
  const run = poses.length === 0 ? step : { ...step, poses: poses.length }
  return [{ ...first, run }, ...poses]
}

export function heldPoseCountOf(line: LoggedCommand): number {
  return 'run' in line ? (line.run.poses ?? 0) : 0
}

export function unrolledRunOf(
  { run, ...first }: LoggedRunCommand,
  heldSeqs: ReadonlySet<number>,
): AuthorityCommand[] {
  const seqs = runSeqsOf(first.seq, run.count, heldSeqs)
  return seqs.map((seq, index) => steppedCommandOf(first, run, index, seq))
}

/** The run's seqs: the player's in turn from its first, past those its held poses took. */
function runSeqsOf(firstSeq: number, count: number, heldSeqs: ReadonlySet<number>): number[] {
  const seqs: number[] = []
  for (let seq = firstSeq; seqs.length < count; seq++) if (!heldSeqs.has(seq)) seqs.push(seq)
  return seqs
}

function steppedCommandOf(
  first: RunCommand,
  run: CommandRunStep,
  index: number,
  seq: number,
): RunCommand {
  const payload = { ...first.payload } as Record<string, unknown>
  for (const [field, step] of Object.entries(run.payload)) {
    payload[field] = (payload[field] as number) + step * index
  }
  return {
    ...first,
    tick: first.tick + run.tick * index,
    seq,
    payload,
  } as RunCommand
}
