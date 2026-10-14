/**
 * The service station's idle motion (ticket 398): the Sell building's parts that move while
 * nothing happens at the bay, posed from the part motion's running seconds as the headlamp's
 * flicker is. Each Tesla arc (`sell-arc`, `sell-arc-2`) strikes at seeded moments, lit or dark,
 * and every lit strike shows its fork upright or flipped about the arc's pivot, so the lightning
 * jumps. Each weld (`sell-spark`, `sell-spark-2`) burns in bursts, its star flickering in size and
 * turning; the second burns half a cycle after the first. The ore on the conveyor
 * (`sell-conveyor`) slides up the belt and starts over each cleat pitch, which looks the same, so
 * the belt seems to run on. A dark arc or spark is squashed flat. With motion effects off (#48
 * acceptance 6) the belt stands and the arcs and sparks hold steady at their full glow.
 * Presentation only.
 */
import {
  STATION_ARC_GLOW,
  STATION_ARC_LIT_SHARE,
  STATION_ARC_STRIKES_PER_SECOND,
  STATION_CONVEYOR_MPS,
  STATION_CONVEYOR_PITCH_M,
  STATION_CONVEYOR_RISE_M,
  STATION_CONVEYOR_RUN_M,
  STATION_WELD_BURN_SECONDS,
  STATION_WELD_CYCLE_SECONDS,
  STATION_WELD_FLICKERS_PER_SECOND,
  STATION_WELD_GLOW,
} from '../../constants/scene'
import { cellRandomFloat } from '../cellRandom'
import type { PartPose } from './partMotion'

const TURN = 2 * Math.PI
const ARC_SEED = 398
const WELD_SEED = 3980
const BELT_LENGTH_M = Math.hypot(STATION_CONVEYOR_RUN_M, STATION_CONVEYOR_RISE_M)
/** The smallest a lit weld star shrinks to, as a share of its full size. */
const WELD_SMALLEST_SHARE = 3 / 5

type StationKind = 'sell-arc' | 'sell-spark' | 'sell-conveyor'

interface StationSlot {
  kind: StationKind
  /** 1 for the first of its kind, 2 for `-2`. */
  repeat: number
}

const STATION_KINDS: readonly string[] = ['sell-arc', 'sell-spark', 'sell-conveyor']

type StationPoseWriter = (station: StationSlot, seconds: number, pose: PartPose) => void

const POSE_WRITERS: Readonly<Record<StationKind, StationPoseWriter>> = {
  'sell-arc': strikeArc,
  'sell-spark': burnWeld,
  'sell-conveyor': slideAlongBelt,
}

/** What each part glows at with motion effects off: the belt carries no light. */
const STEADY_GLOW: Readonly<Record<StationKind, number>> = {
  'sell-arc': STATION_ARC_GLOW,
  'sell-spark': STATION_WELD_GLOW,
  'sell-conveyor': 0,
}

/** Whether the part in `slot` is one of the station's idle parts. */
export function isStationIdlePart(slot: string): boolean {
  return stationSlotOf(slot) !== null
}

/** The pose of a station part `seconds` into the motion. */
export function writeStationIdlePose(
  slot: string,
  seconds: number,
  isMotionReduced: boolean,
  pose: PartPose,
): void {
  const station = stationSlotOf(slot)
  if (station === null) return
  holdStill(pose)
  const writePose = isMotionReduced ? holdSteady : POSE_WRITERS[station.kind]
  writePose(station, seconds, pose)
}

function stationSlotOf(slot: string): StationSlot | null {
  const match = /^(.+?)(?:-([2-9]))?$/.exec(slot)
  if (match === null || !isStationKind(match[1])) return null
  return { kind: match[1], repeat: match[2] === undefined ? 1 : Number.parseInt(match[2], 10) }
}

function isStationKind(kind: string): kind is StationKind {
  return STATION_KINDS.includes(kind)
}

function holdStill(pose: PartPose): void {
  pose.angle = 0
  pose.x = 0
  pose.y = 0
  pose.scaleY = 1
  pose.glow = 0
}

/** The belt stands; the arcs and sparks show whole and glow steadily. */
function holdSteady(station: StationSlot, _seconds: number, pose: PartPose): void {
  pose.glow = STEADY_GLOW[station.kind]
}

function slideAlongBelt(_station: StationSlot, seconds: number, pose: PartPose): void {
  const along = (seconds * STATION_CONVEYOR_MPS) % STATION_CONVEYOR_PITCH_M
  pose.x = (along * STATION_CONVEYOR_RUN_M) / BELT_LENGTH_M
  pose.y = (along * STATION_CONVEYOR_RISE_M) / BELT_LENGTH_M
}

/** A lit strike in the first half of the lit share shows upright, in the second flipped. */
function strikeArc({ repeat }: StationSlot, seconds: number, pose: PartPose): void {
  const strike = Math.floor(seconds * STATION_ARC_STRIKES_PER_SECOND)
  const roll = cellRandomFloat(ARC_SEED, strike, repeat)
  if (roll >= STATION_ARC_LIT_SHARE) return squashFlat(pose)
  pose.scaleY = roll < STATION_ARC_LIT_SHARE / 2 ? 1 : -1
  pose.glow = STATION_ARC_GLOW
}

function burnWeld({ repeat }: StationSlot, seconds: number, pose: PartPose): void {
  if (!isWeldBurning(seconds, repeat)) return squashFlat(pose)
  const flicker = Math.floor(seconds * STATION_WELD_FLICKERS_PER_SECOND)
  const roll = cellRandomFloat(WELD_SEED, flicker, repeat)
  pose.scaleY = WELD_SMALLEST_SHARE + (1 - WELD_SMALLEST_SHARE) * roll
  pose.angle = roll * TURN
  pose.glow = STATION_WELD_GLOW * pose.scaleY
}

/** The welds burn for the first part of each cycle, the second half a cycle behind the first. */
function isWeldBurning(seconds: number, repeat: number): boolean {
  const lag = ((repeat - 1) * STATION_WELD_CYCLE_SECONDS) / 2
  const intoCycle = (seconds + STATION_WELD_CYCLE_SECONDS - lag) % STATION_WELD_CYCLE_SECONDS
  return intoCycle < STATION_WELD_BURN_SECONDS
}

function squashFlat(pose: PartPose): void {
  pose.scaleY = 0
  pose.glow = 0
}
