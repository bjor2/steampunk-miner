/**
 * The Rapier side of a fixed tick's plan (TD scope a on #316, ticket 334, `tickPlan.ts`): the
 * world steps `n` substeps of `dt / n`, the collider halo synced round the body before each, or,
 * past the substep budget, one step with the body's collider off, so the velocity the plan set
 * carries it exactly the swept step with no contact solve. The body is moved by velocity only,
 * never placed, and the motion rule has already run once for the tick.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { SweepGround, TickPlan } from '../systems/vehicle/tickPlan'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'

/** The world, the body and the halo sync a tick steps. */
export interface SteppedTick {
  world: RAPIER.World
  body: RAPIER.RigidBody
  /** Keeps the halo's blocks round where the body is now. */
  syncHalo(): void
}

export function stepWorldThroughTick(tick: SteppedTick, plan: TickPlan): void {
  if (plan.kind === 'sweep') stepKinematically(tick)
  else stepInSubsteps(tick, plan.count)
}

function stepInSubsteps({ world, syncHalo }: SteppedTick, count: number): void {
  world.timestep = PHYSICS_TIMESTEP / count
  for (let substep = 0; substep < count; substep++) {
    syncHalo()
    world.step()
  }
}

/** One step with no contacts; the halo follows on the next tick's first sync. */
function stepKinematically({ world, body }: SteppedTick): void {
  const collider = body.collider(0)
  collider.setEnabled(false)
  world.timestep = PHYSICS_TIMESTEP
  world.step()
  collider.setEnabled(true)
}

/** What a tick past the substep budget sweeps against; it follows the bore while the rig cuts. */
export function sweepGroundOf(
  ground: GroundReader,
  position: Vector2,
  cuttingPose: VehiclePose | null,
): SweepGround {
  return {
    isSolidAt: (x, y) => ground.densityAtPoint(x, y) >= ISO_DENSITY,
    position,
    boreFacing: cuttingPose === null ? null : unitFacingOf(cuttingPose),
  }
}

function unitFacingOf(pose: VehiclePose): Vector2 {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const length = Math.sqrt(facing.x * facing.x + facing.y * facing.y)
  return { x: facing.x / length, y: facing.y / length }
}
