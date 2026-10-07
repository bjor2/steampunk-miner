/**
 * How the car on the showcase reacts to a bought step (#180 section 1, G&V's per-track table in
 * `showcase.json`), and how the turntable eases a selected track's part toward the camera. Pure
 * look maths: the slice's part motion source asks it once per fixed step and hands the poses to
 * the kernel's `partMotionRequests`, which stays the one writer of the car's part motion.
 *
 * Every move swings at full on the tick its step lands, so the part itself moves within 4 ticks
 * (G&V's readability rule), then wobbles down to rest over its moment. A big level-up swings
 * wider for longer; a milestone longest.
 */
import { isAttachId, type AttachId } from '../../../../systems/registries/vehicleAttach'
import type { UpgradeId } from '../../../../systems/economy/economyDefinition'
import SHOWCASE_FILE from '../../showcase.json'
import type { StepMoment } from '../chainCues'

export interface PartSwing {
  x: number
  y: number
  angle: number
  glow: number
}

export interface ShowcaseMove {
  /** Part slots (part ids without their tier) the move sways. */
  slots: readonly string[]
  /** How many times the move swings through rest before it settles. */
  wobbles: number
  pip: PartSwing
  major: PartSwing
}

export interface TrackReaction {
  attach: AttachId
  /** The attach point in the car's frame, metres (vehicle.parts.json): where the leader ends. */
  attachAtM: readonly [number, number]
  /** The turntable's turn while the track is selected. */
  faceTurnRadians: number
  moves: readonly ShowcaseMove[]
}

export interface Showcase {
  turnTicks: number
  momentTicks: Readonly<Record<StepMoment, number>>
  tracks: Readonly<Record<UpgradeId, TrackReaction>>
}

/** The turntable's turn, eased from one selection's angle to the next. */
export interface TurntableTurn {
  fromRadians: number
  toRadians: number
  startTick: number
}

export const SHOWCASE: Showcase = showcaseOf(SHOWCASE_FILE)

export const RESTING_TURN: TurntableTurn = { fromRadians: 0, toRadians: 0, startTick: 0 }

/** How long a step's moment runs on the car. */
export function momentTicksOf(moment: StepMoment, showcase: Showcase = SHOWCASE): number {
  return showcase.momentTicks[moment]
}

/**
 * Writes the move's pose `ageTicks` into its moment into `out` (one scratch per move, so a step
 * allocates nothing); at rest once the moment is over.
 */
export function swingMoveAt(
  move: ShowcaseMove,
  moment: StepMoment,
  ageTicks: number,
  out: PartSwing,
  showcase: Showcase = SHOWCASE,
): PartSwing {
  const share = ageTicks / momentTicksOf(moment, showcase)
  const isResting = share < 0 || share >= 1
  const decay = isResting ? 0 : (1 - share) * (1 - share)
  const swing = decay * Math.cos(2 * Math.PI * move.wobbles * share)
  const peak = moment === 'pip' ? move.pip : move.major
  out.x = peak.x * swing
  out.y = peak.y * swing
  out.angle = peak.angle * swing
  out.glow = peak.glow * decay
  return out
}

/** A new turn toward the track's angle, from wherever the last one stands at `tick`. */
export function turnTowardTrack(
  turn: TurntableTurn,
  track: UpgradeId,
  tick: number,
  showcase: Showcase = SHOWCASE,
): TurntableTurn {
  const toRadians = showcase.tracks[track].faceTurnRadians
  return { fromRadians: turnRadiansAt(turn, tick, showcase), toRadians, startTick: tick }
}

/** The turntable's angle at `tick`: smoothstepped over `turnTicks`. */
export function turnRadiansAt(
  turn: TurntableTurn,
  tick: number,
  showcase: Showcase = SHOWCASE,
): number {
  const share = Math.min(Math.max((tick - turn.startTick) / showcase.turnTicks, 0), 1)
  const eased = share * share * (3 - 2 * share)
  return turn.fromRadians + (turn.toRadians - turn.fromRadians) * eased
}

/**
 * Where a track's part is drawn, in world metres: the car's drawn centre plus the attach point in
 * its frame, turned with its local up, mirrored when it faces left and narrowed by the
 * turntable's turn (`widthShare`, the kernel's projection of the flat art). Written into `out`.
 */
export function placePartPoint(
  reaction: TrackReaction,
  centre: Readonly<{ x: number; y: number }>,
  up: Readonly<{ x: number; y: number }>,
  widthShare: number,
  out: { x: number; y: number },
): void {
  const along = reaction.attachAtM[0] * widthShare
  const upward = reaction.attachAtM[1]
  out.x = centre.x + along * up.y + upward * up.x
  out.y = centre.y - along * up.x + upward * up.y
}

function showcaseOf(file: typeof SHOWCASE_FILE): Showcase {
  const tracks = Object.fromEntries(
    Object.entries(file.tracks).map(([track, reaction]) => [track, reactionOf(reaction)]),
  ) as Record<UpgradeId, TrackReaction>
  return { turnTicks: file.turnTicks, momentTicks: file.momentTicks, tracks }
}

function reactionOf(raw: (typeof SHOWCASE_FILE.tracks)[UpgradeId]): TrackReaction {
  if (!isAttachId(raw.attach)) throw new Error(`showcase.json: "${raw.attach}" is no attach id`)
  const [x, y] = raw.attachAtM
  return { ...raw, attach: raw.attach, attachAtM: [x, y] }
}
