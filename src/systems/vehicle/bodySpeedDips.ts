/**
 * Why a fast rig's body falls short of the speed its motor commands while it cuts (ticket 440,
 * measurement only, from the TD's open finding on #397, comment 6203126887). Read off a rig's
 * ticks in the live loop (`physics/fastRigBodySpeed.lane.test.ts`).
 *
 * Each tick the motor sets the body's velocity along the facing (the cut-follow's `vCut` once the
 * cut has ramped up, ticket 400) and the world steps the body through it against the collider
 * halo. A tick whose body moves more than `HELD_SHARE` short of that is a dip, named by the ground
 * in the slab the commanded move sweeps, from the body's face to the face plus the commanded step:
 *
 * - **stale halo**: ground stood there in the world before the tick's `drillStep` cut and none
 *   stands after it. The halo the world steps against is synced from the planet view the motor's
 *   step took before the loop sent the cut (`vehicleLoop.ts`), so the body meets ground the
 *   authority has already opened that tick;
 * - **uncut ground**: ground still stands there after the cut: the carry's held-out target cell
 *   (#421), a cell harder than the read's `vCut`, a lip;
 * - **unexplained**: the slab is open before and after the cut (a corner or side contact).
 */

/** One fixed tick of a cut, read after it. */
export interface BodySpeedTick {
  /** m/s along the facing the motor set for the tick, before the world stepped; above 0. */
  commanded: number
  /** m/s along the facing the body moved over the tick. */
  speed: number
  /** Density samples standing in the commanded slab in the world before the tick's cut. */
  slabSolidBefore: number
  /** The same samples standing in the world after it. */
  slabSolidAfter: number
}

export type BodySpeedTickKind = 'held' | 'staleHalo' | 'uncutGround' | 'unexplained'

/** What a rig's cut ticks add up to. */
export interface BodySpeedSummary {
  ticks: number
  dips: number
  staleHalo: number
  uncutGround: number
  unexplained: number
  /** The lowest share of its commanded speed a tick moved; 1 with no ticks. */
  lowestShare: number
}

/** Within this share short of the commanded speed, the body holds it (#397's 5% line). */
export const HELD_SHARE = 1 / 20

export function kindOfBodySpeedTick(tick: BodySpeedTick): BodySpeedTickKind {
  if (isHeld(tick)) return 'held'
  if (tick.slabSolidAfter > 0) return 'uncutGround'
  return tick.slabSolidBefore > 0 ? 'staleHalo' : 'unexplained'
}

export function summariseBodySpeed(ticks: readonly BodySpeedTick[]): BodySpeedSummary {
  const kinds = ticks.map(kindOfBodySpeedTick)
  const countOf = (kind: BodySpeedTickKind) => kinds.filter((each) => each === kind).length
  return {
    ticks: ticks.length,
    dips: ticks.length - countOf('held'),
    staleHalo: countOf('staleHalo'),
    uncutGround: countOf('uncutGround'),
    unexplained: countOf('unexplained'),
    lowestShare: lowestShareOf(ticks),
  }
}

function isHeld({ commanded, speed }: BodySpeedTick): boolean {
  return speed >= commanded * (1 - HELD_SHARE)
}

function lowestShareOf(ticks: readonly BodySpeedTick[]): number {
  return ticks.reduce((lowest, { commanded, speed }) => Math.min(lowest, speed / commanded), 1)
}
