/**
 * The collider's growth to the rig's width level on the Rapier side (GD lock on #662 Part B,
 * ticket 750; the rule is `systems/vehicle/bodyGrowth.ts`). The vehicle's motor calls it once a
 * fixed step, and it is the only writer of the collider's size:
 *
 * - a step's growth lifts the body by velocity (the growth along `localUp`, over the step) and
 *   widens the box once the world has stepped, so its wheels end the step where they began and the
 *   box never enters its floor; a shrink narrows the box first and lowers the body the same way;
 * - the rise is taken back off the velocity the next step reads, so the motion rule integrates
 *   gravity and contacts on the body's own motion, never on its growth; a body growing on its floor
 *   leaves that floor for the step, so the motor holds it as the floor would, dropping the
 *   velocity's fall into it (else gravity piled up a tick at a time and the wheels sank);
 * - the halo reaches as far round the body as its new size needs (`haloRadiusBlocksFor`).
 *
 * Its probes and the rise read the position the body will reach this step, so the band it grows
 * into is the one it will stand in.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { MM_PER_METRE, PHYSICS_TIMESTEP } from '../constants/physics'
import {
  BARE_BODY_GROWTH,
  climbToGrowMm,
  nextBodyGrowth,
  ownedCentreOf,
  riseMmOf,
  type BodyGrowth,
  type IsBlockedAt,
} from '../systems/vehicle/bodyGrowth'
import { haloRadiusBlocksFor } from '../systems/vehicle/colliderHalo'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { GroundHalo } from './groundHalo'

/** What one step's growth reads: the owned body, where the body will stand, and the ground. */
export interface GrowthStep {
  ownedHalfMm: number
  /** The collider's centre now, and the velocity the motion rule gave it this step, m and m/s. */
  position: Vector2
  velocity: Vector2
  up: Vector2
  isBlockedAt: IsBlockedAt
  /** The wheels stand on a floor that holds them (not a face a cut down is opening under them). */
  isOnFloor: boolean
}

export interface BodyGrowthMotor {
  /** The collider's half side now, m. */
  halfSide(): number
  /** The body's own velocity: what Rapier reports less the rise the last step added. */
  ownVelocityOf(reported: Vector2): Vector2
  /** The owned body's centre standing on the collider's wheels: what the pose reports. */
  ownedCentreOf(position: Vector2, up: Vector2, ownedHalfMm: number): Vector2
  /**
   * Plans this step's growth, narrowing a shrinking box now: the velocity to add along `up`, m/s,
   * the rise and, on a floor, the fall the floor would have stopped.
   */
  planStep(step: GrowthStep): number
  /** Once the world has stepped: widens a growing box to the planned size. */
  finishStep(): void
  /** A respawn (the one time the body is placed): the bare box again, regrown from there. */
  restart(): void
  /** The growth now, for the camera and the specs. */
  growth(): BodyGrowth
}

export function createBodyGrowthMotor(body: RAPIER.RigidBody, halo: GroundHalo): BodyGrowthMotor {
  let growth = BARE_BODY_GROWTH
  let pendingHalfMm: number | null = null
  const lastRise = { x: 0, y: 0 }
  const resize = (halfMm: number) => {
    const half = halfMm / MM_PER_METRE
    body.collider(0).setHalfExtents({ x: half, y: half, z: half })
    halo.reachBlocks(haloRadiusBlocksFor(half))
  }

  return {
    halfSide: () => growth.halfMm / MM_PER_METRE,
    ownVelocityOf: (reported) => ({ x: reported.x - lastRise.x, y: reported.y - lastRise.y }),
    ownedCentreOf: (position, up, ownedHalfMm) => ownedCentreOf(position, up, growth, ownedHalfMm),
    planStep(step) {
      const next = nextBodyGrowth(growth, step.ownedHalfMm, climbReaderOf(step))
      const riseMm = riseMmOf(growth, next)
      if (next.halfMm < growth.halfMm) resize(next.halfMm)
      pendingHalfMm = next.halfMm > growth.halfMm ? next.halfMm : null
      growth = next
      const rise = riseMm / MM_PER_METRE / PHYSICS_TIMESTEP
      lastRise.x = step.up.x * rise
      lastRise.y = step.up.y * rise
      return rise + heldFallOf(step, riseMm)
    },
    finishStep() {
      if (pendingHalfMm === null) return
      resize(pendingHalfMm)
      pendingHalfMm = null
    },
    restart() {
      if (growth.halfMm !== BARE_BODY_GROWTH.halfMm) resize(BARE_BODY_GROWTH.halfMm)
      growth = BARE_BODY_GROWTH
      pendingHalfMm = null
      lastRise.x = 0
      lastRise.y = 0
    },
    growth: () => growth,
  }
}

/** A body rising off its floor this step: its velocity's fall into the floor, m/s, else 0. */
function heldFallOf({ velocity, up, isOnFloor }: GrowthStep, riseMm: number): number {
  if (riseMm <= 0 || !isOnFloor) return 0
  return Math.max(0, -(velocity.x * up.x + velocity.y * up.y))
}

/**
 * The room probe for this step: the band a growing box would take, standing where the body's
 * wheels will be once the step's drive along its floor has carried it. The motion along `up` is
 * left out: on its support that is gravity the floor holds, and down a shaft the band where the
 * body stands now is the narrower one.
 */
function climbReaderOf(step: GrowthStep) {
  return (fromMm: number, toMm: number): number | null => {
    const { position, velocity, up } = step
    const upward = velocity.x * up.x + velocity.y * up.y
    const wheelsBelow = fromMm / MM_PER_METRE
    const bottom = {
      x: position.x + (velocity.x - up.x * upward) * PHYSICS_TIMESTEP - up.x * wheelsBelow,
      y: position.y + (velocity.y - up.y * upward) * PHYSICS_TIMESTEP - up.y * wheelsBelow,
    }
    return climbToGrowMm(step.isBlockedAt, { bottom, up }, fromMm, toMm)
  }
}
