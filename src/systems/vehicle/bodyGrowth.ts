/**
 * The collider's growth to the rig's width level (GD lock on #662 Part B, ticket 750). The host
 * derives the level every tick from what the player owns (`registries/boreWidth.ts`), and the body
 * it owns is the square `bodyHalfMmAt(level)` stands for; the collider follows that square:
 *
 * - **Bottom-anchored.** The collider grows up from its wheels, never about its centre, so on its
 *   support it never sinks into the floor: the physics layer moves the body up by the growth as a
 *   velocity for the step, then widens the box (`physics/vehicleController.ts`), never placing it.
 * - **Cut first.** A step's growth goes ahead only where the band it would take is open ground
 *   (`climbToGrowMm`): never a cell the cut left standing, a gated one included, so the collider
 *   never carves and never wedges. A floor that rises under the new sides (a slope, the blend
 *   between samples) is climbed by up to a step's growth, as a box on that floor would stand on its
 *   high corner; a lip or a wall is ground in the way. Otherwise it waits, probing every step up to
 *   `BODY_GROWTH_WAIT_LIMIT_TICKS` and then once a period ("applies when clear"); the rig drives
 *   on meanwhile, so the wait never holds it.
 * - **The owned body's centre** is what the pose reports (`ownedCentreOf`): the owned square
 *   standing on the collider's wheels. The host cuts round that square, its floor at the wheels, so
 *   the cut makes the room the collider grows into, and a growing body never drops its floor.
 *
 * A level lost (a fork re-chosen) shrinks the collider at the same pace, which always has room.
 * Integer mm in, so the growth is the same on every machine; the room probe reads metres, as the
 * collider does.
 */
import {
  BODY_GROWTH_FLOOR_ALLOWANCE_MM,
  BODY_GROWTH_PROBE_STEP_MM,
  BODY_GROWTH_SECONDS_PER_LEVEL,
  BODY_GROWTH_WAIT_LIMIT_TICKS,
  MM_PER_METRE,
  TICKS_PER_SECOND,
} from '../../constants/physics'
import { DRILL_BORE_ROWS } from '../../constants/balance'
import { BARE_WIDTH_LEVEL, bodyHalfMmAt } from './drillBore'
import type { Vector2 } from './localFrame'

/**
 * The collider's half side now, the steps its growth has waited on ground in the way, and how far
 * its last step climbed a floor rising under its new sides, mm.
 */
export interface BodyGrowth {
  halfMm: number
  waitedTicks: number
  climbMm: number
}

/**
 * How far a step growing the half side from `fromMm` to `toMm` must climb its floor, mm: 0 on a
 * level one, null where the band has no room.
 */
export type ClimbReader = (fromMm: number, toMm: number) => number | null

/** Whether ground the collider may not enter stands at a point, in metres. */
export type IsBlockedAt = (x: number, y: number) => boolean

/** Where the collider stands: the middle of its wheel line and its up, in metres. */
export interface GrowthFooting {
  bottom: Vector2
  up: Vector2
}

/** The bare body, grown to nothing. */
export const BARE_BODY_GROWTH: BodyGrowth = {
  halfMm: bodyHalfMmAt(BARE_WIDTH_LEVEL),
  waitedTicks: 0,
  climbMm: 0,
}

/** The lowest band beside the wheels is probed this finely for the floor a growth climbs, mm. */
const CLIMB_PROBE_STEP_MM = 5

/** How far the half side moves in one step: a level's half metre in `BODY_GROWTH_SECONDS_PER_LEVEL`. */
export function growthStepMm(): number {
  const halfLevelMm = DRILL_BORE_ROWS.bodyWidthPerLevelMm / 2
  return Math.ceil(halfLevelMm / (BODY_GROWTH_SECONDS_PER_LEVEL * TICKS_PER_SECOND))
}

/**
 * The growth one step on toward `ownedHalfMm`: a step's shrink at once, a step's growth where
 * `climbFor(fromMm, toMm)` finds room (with the climb it takes), else one more step waited.
 */
export function nextBodyGrowth(
  growth: BodyGrowth,
  ownedHalfMm: number,
  climbFor: ClimbReader,
): BodyGrowth {
  if (isAtRest(growth, ownedHalfMm)) return growth
  if (growth.halfMm >= ownedHalfMm) return shrunkToward(growth, ownedHalfMm)
  if (!isDueToProbe(growth.waitedTicks)) return waitedOneStep(growth)
  const halfMm = Math.min(ownedHalfMm, growth.halfMm + growthStepMm())
  const climbMm = climbFor(growth.halfMm, halfMm)
  return climbMm === null ? waitedOneStep(growth) : { halfMm, waitedTicks: 0, climbMm }
}

/** How far the collider's wheels move up this step, mm: its growth and the floor it climbed. */
export function riseMmOf(growth: BodyGrowth, next: BodyGrowth): number {
  return next.halfMm - growth.halfMm + next.climbMm
}

/** Whether the collider stands at the owned body's size. */
export function isFullyGrown(growth: BodyGrowth, ownedHalfMm: number): boolean {
  return growth.halfMm === ownedHalfMm
}

/** Whether the growth has waited past the limit: the HUD's "applies when clear". */
export function isWaitingForRoom(growth: BodyGrowth): boolean {
  return growth.waitedTicks >= BODY_GROWTH_WAIT_LIMIT_TICKS
}

/**
 * The owned body's centre, metres: the square of `ownedHalfMm` standing on the wheels of the
 * collider centred at `centre` with `growth`'s half side.
 */
export function ownedCentreOf(
  centre: Vector2,
  up: Vector2,
  growth: BodyGrowth,
  ownedHalfMm: number,
): Vector2 {
  const riseM = (ownedHalfMm - growth.halfMm) / MM_PER_METRE
  return { x: centre.x + up.x * riseM, y: centre.y + up.y * riseM }
}

/**
 * How far a collider standing on `footing` climbs growing from `fromMm` to `toMm` of half side, mm,
 * or null where it has no room. The floor under its new sides may rise up to a step's growth over
 * the wheels (probed `CLIMB_PROBE_STEP_MM` apart just over them); above that floor its new sides
 * and its strip over the top, lifted by the climb, must be clear, probed on a grid
 * `BODY_GROWTH_PROBE_STEP_MM` apart with both edges included.
 */
export function climbToGrowMm(
  isBlockedAt: IsBlockedAt,
  footing: GrowthFooting,
  fromMm: number,
  toMm: number,
): number | null {
  const lowMm = BODY_GROWTH_FLOOR_ALLOWANCE_MM
  const sidesFromMm = lowMm + growthStepMm()
  const left = { acrossFrom: -toMm, acrossTo: -fromMm, upFrom: lowMm, upTo: sidesFromMm }
  const right = { acrossFrom: fromMm, acrossTo: toMm, upFrom: lowMm, upTo: sidesFromMm }
  const climbMm = Math.max(
    floorClimbMm(isBlockedAt, footing, left),
    floorClimbMm(isBlockedAt, footing, right),
  )
  if (climbMm > growthStepMm()) return null
  const sides = { upFrom: sidesFromMm, upTo: 2 * fromMm + climbMm }
  const top = { acrossFrom: -toMm, acrossTo: toMm, upFrom: 2 * fromMm, upTo: 2 * toMm + climbMm }
  const isClear =
    isStripClear(isBlockedAt, footing, { ...left, ...sides }) &&
    isStripClear(isBlockedAt, footing, { ...right, ...sides }) &&
    isStripClear(isBlockedAt, footing, top)
  return isClear ? climbMm : null
}

/** A rectangle in the collider's frame, mm: across its up axis and up from its wheels. */
interface Strip {
  acrossFrom: number
  acrossTo: number
  upFrom: number
  upTo: number
}

function isStripClear(isBlockedAt: IsBlockedAt, footing: GrowthFooting, strip: Strip): boolean {
  for (let upMm = strip.upFrom; ; upMm = nextStop(upMm, strip.upTo)) {
    if (!isRowClear(isBlockedAt, footing, strip, upMm)) return false
    if (upMm >= strip.upTo) return true
  }
}

function isRowClear(
  isBlockedAt: IsBlockedAt,
  footing: GrowthFooting,
  strip: Strip,
  upMm: number,
): boolean {
  for (let acrossMm = strip.acrossFrom; ; acrossMm = nextStop(acrossMm, strip.acrossTo)) {
    if (isBlockedInFrame(isBlockedAt, footing, acrossMm, upMm)) return false
    if (acrossMm >= strip.acrossTo) return true
  }
}

/**
 * How far over the strip's floor line the floor stands under it, mm: a fine probe's step past the
 * highest blocked one, 0 with none; past the strip's top when its top probe is blocked.
 */
function floorClimbMm(isBlockedAt: IsBlockedAt, footing: GrowthFooting, strip: Strip): number {
  let climbMm = 0
  for (let acrossMm = strip.acrossFrom; ; acrossMm = nextStop(acrossMm, strip.acrossTo)) {
    for (let upMm = strip.upFrom; upMm <= strip.upTo; upMm += CLIMB_PROBE_STEP_MM) {
      if (isBlockedInFrame(isBlockedAt, footing, acrossMm, upMm)) {
        climbMm = Math.max(climbMm, upMm - strip.upFrom + CLIMB_PROBE_STEP_MM)
      }
    }
    if (acrossMm >= strip.acrossTo) return climbMm
  }
}

/** The next probe along a strip's side: a step on, never past its far edge. */
function nextStop(mm: number, endMm: number): number {
  return Math.min(endMm, mm + BODY_GROWTH_PROBE_STEP_MM)
}

/** The point `acrossMm` along the tangent and `upMm` up from the wheels, blocked or not. */
function isBlockedInFrame(
  isBlockedAt: IsBlockedAt,
  { bottom, up }: GrowthFooting,
  acrossMm: number,
  upMm: number,
): boolean {
  const across = acrossMm / MM_PER_METRE
  const rise = upMm / MM_PER_METRE
  return isBlockedAt(bottom.x + up.y * across + up.x * rise, bottom.y - up.x * across + up.y * rise)
}

/** Grown to the owned body with nothing waited: the same growth, so a resting step allocates nothing. */
function isAtRest(growth: BodyGrowth, ownedHalfMm: number): boolean {
  return growth.halfMm === ownedHalfMm && growth.waitedTicks === 0 && growth.climbMm === 0
}

function shrunkToward(growth: BodyGrowth, ownedHalfMm: number): BodyGrowth {
  const halfMm = Math.max(ownedHalfMm, growth.halfMm - growthStepMm())
  return { halfMm, waitedTicks: 0, climbMm: 0 }
}

/** Every step up to the limit, then the first step of each period after it. */
function isDueToProbe(waitedTicks: number): boolean {
  return (
    waitedTicks < BODY_GROWTH_WAIT_LIMIT_TICKS || waitedTicks % BODY_GROWTH_WAIT_LIMIT_TICKS === 0
  )
}

function waitedOneStep(growth: BodyGrowth): BodyGrowth {
  return { halfMm: growth.halfMm, waitedTicks: growth.waitedTicks + 1, climbMm: 0 }
}
