/**
 * `replayRun(worldSeed, commands)` (decision #11 section 3): the authority re-run from the replay
 * input, the world seed plus `commands.ndjson` exactly as `applyCommand` received them, rejected
 * ones included. The clock moves to each command's tick first, as the live fixed step does, so
 * the periodic, dock and travel `state_digest`s come out at the same ticks as in the logged run.
 *
 * `framesPerSecond` replays the clock in render-frame batches (the live game's fixed-step clock),
 * which must not change a single digest: the state never depends on how ticks were batched.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { advanceTicks } from '../authority/advanceTicks'
import { applyCommand, type CommandOutcome } from '../authority/applyCommand'
import type { AuthorityCommand } from '../authority/authorityCommand'
import { createAuthorityState } from '../authority/authorityState'
import type { DigestScope, DomainEvent } from '../authority/domainEvent'
import { stateDigest } from '../authority/stateDigest'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame, type FixedStepClock } from '../fixedStepClock'

/** A run starts on planet 1 of its world (#4), as the store's fresh session does. */
const STARTING_PLANET_INDEX = 1
const STARTING_PLAYER_IDS: readonly string[] = ['p1']
const STEP_SECONDS = 1 / TICKS_PER_SECOND

export interface DigestRecord {
  tick: number
  scope: DigestScope
  digest: string
}

export interface ReplayOptions {
  /** The run's last tick; defaults to the last command's. The `end` digest is taken there. */
  endTick?: number
  /** Replays the clock in frames of this rate; absent, it jumps straight to each command. */
  framesPerSecond?: number
  /** The session's players; defaults to everyone who sent a command, or `p1`. */
  playerIds?: readonly string[]
}

export interface ReplayResult extends CommandOutcome {
  /** Every digest the run logged, in order, ending with the `end` digest. */
  digests: DigestRecord[]
}

/** Where the replay's own clock is; the authority's tick lives in its state. */
interface ReplayProgress {
  outcome: CommandOutcome
  frames: FrameClock | null
}

export function replayRun(
  worldSeed: number,
  commands: readonly AuthorityCommand[],
  options: ReplayOptions = {},
): ReplayResult {
  const start = startingProgress(worldSeed, commands, options)
  const replayed = commands.reduce(applyRecordedCommand, start)
  const ended = advanceProgressTo(replayed, endTickOf(commands, options, replayed))
  return resultOf(ended.outcome)
}

/** The first logged digest the replay does not reproduce, with its tick (#11 section 3). */
export function firstDigestMismatch(
  logged: readonly DigestRecord[],
  replayed: readonly DigestRecord[],
): string | null {
  const length = Math.max(logged.length, replayed.length)
  for (let index = 0; index < length; index++) {
    const mismatch = digestMismatchOf(logged[index], replayed[index], index)
    if (mismatch !== null) return mismatch
  }
  return null
}

function digestMismatchOf(
  logged: DigestRecord | undefined,
  replayed: DigestRecord | undefined,
  index: number,
): string | null {
  if (logged === undefined) return `digest ${index} at tick ${replayed?.tick} was not logged`
  if (replayed === undefined) return `digest ${index} at tick ${logged.tick} was not replayed`
  const isSame =
    logged.tick === replayed.tick &&
    logged.scope === replayed.scope &&
    logged.digest === replayed.digest
  if (isSame) return null
  return (
    `digest ${index} differs: logged ${logged.scope} ${logged.digest} at tick ${logged.tick}, ` +
    `replayed ${replayed.scope} ${replayed.digest} at tick ${replayed.tick}`
  )
}

function startingProgress(
  worldSeed: number,
  commands: readonly AuthorityCommand[],
  options: ReplayOptions,
): ReplayProgress {
  const state = createAuthorityState({
    planetIndex: STARTING_PLANET_INDEX,
    planetSeed: worldSeed,
    playerIds: options.playerIds ?? playerIdsOf(commands),
  })
  const frames =
    options.framesPerSecond === undefined ? null : newFrameClock(options.framesPerSecond)
  return { outcome: { state, events: [] }, frames }
}

function playerIdsOf(commands: readonly AuthorityCommand[]): readonly string[] {
  const ids = [...new Set(commands.map((command) => command.playerId))].sort()
  return ids.length > 0 ? ids : STARTING_PLAYER_IDS
}

/** A malformed or out-of-order command is applied as recorded, so it is refused as it was. */
function applyRecordedCommand(progress: ReplayProgress, command: AuthorityCommand) {
  const advanced = advanceProgressTo(progress, command.tick)
  return { ...advanced, outcome: keepEvents(advanced.outcome, applyCommand, command) }
}

function advanceProgressTo(progress: ReplayProgress, toTick: number): ReplayProgress {
  const { outcome, frames } = progress
  if (!Number.isSafeInteger(toTick) || toTick <= outcome.state.tick) return progress
  if (frames === null) return { outcome: keepEvents(outcome, advanceTicks, toTick), frames }
  return advanceInFrames(outcome, frames, toTick)
}

function advanceInFrames(
  outcome: CommandOutcome,
  frames: FrameClock,
  toTick: number,
): ReplayProgress {
  let progress: ReplayProgress = {
    outcome,
    frames: { ...frames, tick: Math.max(frames.tick, outcome.state.tick) },
  }
  while (progress.outcome.state.tick < toTick) {
    const next = nextFrameEnd(progress.frames as FrameClock, toTick)
    progress = { outcome: keepEvents(progress.outcome, advanceTicks, next.tick), frames: next }
  }
  return progress
}

/** The replay owns its event list and appends to it, so a long run stays linear. */
function keepEvents<A>(
  outcome: CommandOutcome,
  step: (state: CommandOutcome['state'], argument: A) => CommandOutcome,
  argument: A,
): CommandOutcome {
  const next = step(outcome.state, argument)
  for (const event of next.events) outcome.events.push(event)
  return { state: next.state, events: outcome.events }
}

function endTickOf(
  commands: readonly AuthorityCommand[],
  options: ReplayOptions,
  progress: ReplayProgress,
): number {
  return options.endTick ?? commands.at(-1)?.tick ?? progress.outcome.state.tick
}

function resultOf(outcome: CommandOutcome): ReplayResult {
  const end: DigestRecord = {
    tick: outcome.state.tick,
    scope: 'end',
    digest: stateDigest(outcome.state),
  }
  return { ...outcome, digests: [...digestsOf(outcome.events), end] }
}

export function digestsOf(events: readonly DomainEvent[]): DigestRecord[] {
  return events.flatMap((event) =>
    event.type === 'StateDigested'
      ? [{ tick: event.tick, scope: event.scope, digest: event.digest }]
      : [],
  )
}

/**
 * Render frames as the live game has them: the fixed-step clock turns each frame into whole
 * steps, so the authority is advanced at frame ends, and a frame a command falls in is cut there.
 */
interface FrameClock {
  frameSeconds: number
  clock: FixedStepClock
  /** The tick the last frame ended at. */
  tick: number
}

function newFrameClock(framesPerSecond: number): FrameClock {
  return { frameSeconds: 1 / framesPerSecond, clock: NEW_FIXED_STEP_CLOCK, tick: 0 }
}

/** The end of the next frame that moves time, capped at `limit`. */
function nextFrameEnd(frames: FrameClock, limit: number): FrameClock {
  let { clock, tick } = frames
  while (tick === frames.tick) {
    const frame = stepsForFrame(clock, frames.frameSeconds, STEP_SECONDS, Number.MAX_SAFE_INTEGER)
    clock = frame.clock
    tick += frame.steps
  }
  return { ...frames, clock, tick: Math.min(tick, limit) }
}
