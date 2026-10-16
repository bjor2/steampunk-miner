/**
 * The high-speed camera law (#316 GD camera lock, ticket 338): at speed the camera leans ahead and
 * pulls back so at least `T_warn` (1 s) of ground stays visible ahead of the rig, up to the screen
 * shape's zoom cap. The numbers are `SPEED_FRAMING` in `constants/scene.ts`, with the law written out.
 *
 * On a portrait screen (ticket 484) the view keeps desktop's vertical metres, so the pull-back runs
 * on that vertical extent alone (zooming out for a sideways drive would change the felt speed), and
 * the lean is laid in the camera's frame: `f` of the half height down the screen, and its own
 * ramp `f_h` of the half width across it, so the rig never leaves the narrow width.
 *
 * Presentation only: the felt speed comes from the client pose, every ease runs on the render
 * delta, and nothing here reaches the authority, a command, the digest or a replay. The state is
 * updated in place because it runs every frame and must not allocate (CLAUDE.md frame rules).
 */
import { CAMERA_TURN_SECONDS, SPEED_FRAMING } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'

/** The share of the gap an ease has closed after its stated seconds, as the zoom ease (#39). */
const EASE_SHARE_AT_END = 0.95
/** Closer than this (as a ratio) and an eased value snaps to its target. */
const SNAP_RATIO = 1e-4
/** The pull-in hold looks back over two to three buckets: from 1 s to 1.5 s of frames. */
const HOLD_BUCKET_SECONDS = SPEED_FRAMING.pullInHoldSeconds / 2

export interface SpeedFraming {
  /** `vCam`: the rig's felt speed along the drive, cells (metres) a second. */
  feltSpeed: number
  /** `f`: the eased share of the half vertical extent the rig sits behind the screen centre. */
  leadShare: number
  /** `f_h`: the eased share of the half width the rig sits behind it across a portrait screen. */
  sideLeadShare: number
  /** The eased drive direction the lean points along; shorter than 1 mid-turn. */
  leadDirection: Vector2
  /** The eased auto pull-back, metres down the screen's height; 0 when standing still. */
  pullBack: number
  /** The largest pull-back need seen in this hold bucket and the two before it. */
  holdBuckets: { current: number; previous: number; older: number; seconds: number }
}

export function createSpeedFraming(): SpeedFraming {
  return {
    feltSpeed: 0,
    leadShare: 0,
    sideLeadShare: 0,
    leadDirection: { x: 0, y: 0 },
    pullBack: 0,
    holdBuckets: { current: 0, previous: 0, older: 0, seconds: 0 },
  }
}

/** One frame of the law: feel the speed, lean ahead, then size and ease the pull-back. */
export function stepSpeedFraming(
  framing: SpeedFraming,
  velocity: Vector2,
  ahead: Vector2,
  dt: number,
): void {
  feelSpeed(framing, speedAlongDriveOf(velocity, ahead), dt)
  leanAhead(framing, ahead, dt)
  holdPullBackNeed(framing, pullBackNeedOf(framing.feltSpeed, framing.leadShare), dt)
  easePullBack(framing, heldPullBackNeedOf(framing), dt)
}

/** The rig's speed along the drive; driving backwards feels like standing still. */
export function speedAlongDriveOf(velocity: Vector2, ahead: Vector2): number {
  return Math.max(0, velocity.x * ahead.x + velocity.y * ahead.y)
}

/** `f = clamp((vCam - 3) / 12, 0, 0.6)` (Gameplay's proposal section 2). */
export function leadShareOf(feltSpeed: number): number {
  const { leadStartCellsPerSecond, leadSpanCellsPerSecond, leadMaxShare } = SPEED_FRAMING
  const share = (feltSpeed - leadStartCellsPerSecond) / leadSpanCellsPerSecond
  return Math.min(leadMaxShare, Math.max(0, share))
}

/** `f_h = clamp((vCam - 3) / 2.6, 0, 1) x 0.6`: the full lean by 5.6 cells/s (ticket 484). */
export function sideLeadShareOf(feltSpeed: number): number {
  const { leadStartCellsPerSecond, sideLeadFullCellsPerSecond, leadMaxShare } = SPEED_FRAMING
  const ramp =
    (feltSpeed - leadStartCellsPerSecond) / (sideLeadFullCellsPerSecond - leadStartCellsPerSecond)
  return Math.min(1, Math.max(0, ramp)) * leadMaxShare
}

/** `2 vCam T_warn / (1 + f)`: the short axis that shows `T_warn` of ground ahead (section 3). */
export function pullBackNeedOf(feltSpeed: number, leadShare: number): number {
  return (2 * feltSpeed * SPEED_FRAMING.warnSeconds) / (1 + leadShare)
}

/** The short axis shown: the player's zoom, pulled back for speed, never past the shape's cap. */
export function framedShortAxisOf(framing: SpeedFraming, playerShown: number, cap: number): number {
  return Math.min(cap, Math.max(playerShown, framing.pullBack))
}

/** Metres of ground visible ahead of the rig: `h (1 + f)` with `h` half the short axis. */
export function groundAheadOf(shortAxis: number, leadShare: number): number {
  return (shortAxis / 2) * (1 + leadShare)
}

/** The framed view's two extents in metres, and the camera's roll (ticket 484). */
export interface FramedView {
  /** Down the screen's height: the zoom, pulled back for speed. */
  verticalMetres: number
  /** Across the screen's width: the vertical extent times width over height. */
  horizontalMetres: number
  /** The camera's roll, counter-clockwise. */
  turnRadians: number
}

export type ViewExtent = Pick<FramedView, 'verticalMetres' | 'horizontalMetres'>

export function isPortraitView(view: ViewExtent): boolean {
  return view.horizontalMetres < view.verticalMetres
}

/**
 * Where the camera sits ahead of the rig, world metres, written into `out`. On a landscape screen
 * `f h` along the eased drive direction (ticket 338, unchanged); on a portrait one, laid in the
 * camera's frame (ticket 484).
 */
export function leadOffsetInto(out: Vector2, framing: SpeedFraming, view: FramedView): Vector2 {
  if (isPortraitView(view)) return leadAcrossPortraitInto(out, framing, view)
  return leadAlongDriveInto(out, framing, view.verticalMetres)
}

function leadAlongDriveInto(out: Vector2, framing: SpeedFraming, shortAxis: number): Vector2 {
  out.x = framing.leadShare * (shortAxis / 2) * framing.leadDirection.x
  out.y = framing.leadShare * (shortAxis / 2) * framing.leadDirection.y
  return out
}

/**
 * The drive direction turned onto the screen, its across part scaled by `f_h` of the half width
 * and its up part by `f` of the half height, then turned back into the world.
 */
function leadAcrossPortraitInto(out: Vector2, framing: SpeedFraming, view: FramedView): Vector2 {
  const cos = Math.cos(view.turnRadians)
  const sin = Math.sin(view.turnRadians)
  const { x, y } = framing.leadDirection
  const across = (x * cos + y * sin) * framing.sideLeadShare * (view.horizontalMetres / 2)
  const up = (y * cos - x * sin) * framing.leadShare * (view.verticalMetres / 2)
  out.x = across * cos - up * sin
  out.y = across * sin + up * cos
  return out
}

/**
 * Metres of ground visible ahead of the rig on a drive across the screen: half the width plus the
 * lean across it, `(W / 2)(1 + f_h)` on a portrait screen (ticket 484) and `W / 2 + f h` on a
 * landscape one, where the lean is scaled by the half height.
 */
export function horizontalGroundAheadOf(
  view: ViewExtent,
  lean: Pick<SpeedFraming, 'leadShare' | 'sideLeadShare'>,
): number {
  const halfWidth = view.horizontalMetres / 2
  const share = isPortraitView(view) ? lean.sideLeadShare : lean.leadShare
  return halfWidth + share * Math.min(halfWidth, view.verticalMetres / 2)
}

function feelSpeed(framing: SpeedFraming, speed: number, dt: number): void {
  const share = 1 - Math.exp(-dt / SPEED_FRAMING.feltSpeedSeconds)
  framing.feltSpeed += (speed - framing.feltSpeed) * share
}

/** The lean's sizes ease over 0.4 s; its direction follows a turn as the camera roll does. */
function leanAhead(framing: SpeedFraming, ahead: Vector2, dt: number): void {
  const leadShare = leadShareOf(framing.feltSpeed)
  const sideLeadShare = sideLeadShareOf(framing.feltSpeed)
  framing.leadShare = easeToward(framing.leadShare, leadShare, SPEED_FRAMING.leadEaseSeconds, dt)
  framing.sideLeadShare = easeToward(
    framing.sideLeadShare,
    sideLeadShare,
    SPEED_FRAMING.leadEaseSeconds,
    dt,
  )
  const turnShare = 1 - Math.exp(-dt / CAMERA_TURN_SECONDS)
  framing.leadDirection.x += (ahead.x - framing.leadDirection.x) * turnShare
  framing.leadDirection.y += (ahead.y - framing.leadDirection.y) * turnShare
}

/** Keeps the largest need per bucket, so a need must stay lower for 1 s before the view eases in. */
function holdPullBackNeed(framing: SpeedFraming, need: number, dt: number): void {
  const buckets = framing.holdBuckets
  buckets.seconds += dt
  if (buckets.seconds >= HOLD_BUCKET_SECONDS) {
    buckets.older = buckets.previous
    buckets.previous = buckets.current
    buckets.current = 0
    buckets.seconds = 0
  }
  buckets.current = Math.max(buckets.current, need)
}

function heldPullBackNeedOf(framing: SpeedFraming): number {
  const { current, previous, older } = framing.holdBuckets
  return Math.max(current, previous, older)
}

/** Out over 0.5 s, in over 1 s (section 3). */
function easePullBack(framing: SpeedFraming, need: number, dt: number): void {
  const isPullingOut = need > framing.pullBack
  const seconds = isPullingOut ? SPEED_FRAMING.pullOutEaseSeconds : SPEED_FRAMING.pullInEaseSeconds
  framing.pullBack = easeToward(framing.pullBack, need, seconds, dt)
}

/** Closes 95% of the gap in `seconds` at any frame rate, and snaps once it is all but there. */
function easeToward(current: number, target: number, seconds: number, dt: number): number {
  const share = 1 - (1 - EASE_SHARE_AT_END) ** (dt / seconds)
  const eased = current + (target - current) * share
  const isThere = Math.abs(eased - target) <= SNAP_RATIO * Math.max(Math.abs(target), 1)
  return isThere ? target : eased
}

/** The speed framing as the debug API reads it (ticket 338 acceptance: ground ahead per second). */
export interface SpeedView {
  feltSpeedCellsPerSecond: number
  leadShare: number
  /** `f_h`: the lean across a portrait screen (ticket 484). */
  sideLeadShare: number
  /** Metres of ground visible ahead of the rig on a drive down the screen. */
  groundAheadMetres: number
  /** Metres of ground visible ahead of the rig on a drive across the screen (ticket 484). */
  groundAheadHorizontalMetres: number
}

export function speedViewOf(
  view: ViewExtent,
  feltSpeed: number,
  lean: Pick<SpeedFraming, 'leadShare' | 'sideLeadShare'>,
): SpeedView {
  return {
    feltSpeedCellsPerSecond: feltSpeed,
    leadShare: lean.leadShare,
    sideLeadShare: lean.sideLeadShare,
    groundAheadMetres: groundAheadOf(view.verticalMetres, lean.leadShare),
    groundAheadHorizontalMetres: horizontalGroundAheadOf(view, lean),
  }
}
