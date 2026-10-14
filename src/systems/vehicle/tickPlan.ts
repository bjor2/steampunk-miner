/**
 * How the physics layer steps one fixed tick at the rig's speed (TD scope a on #316, locked with
 * both Scalers, ticket 334). The motion rule still runs once a tick; the world then steps
 *
 * - `n = ceil(step / SUBSTEP_REACH_MM)` substeps of `dt / n` (24 m/s a substep), with the collider
 *   halo synced round the body before each, while `n` is within `MAX_PHYSICS_SUBSTEPS`;
 * - past that budget (over 96 m/s), one kinematic grid sweep (`kinematicSweep.ts`): no contact
 *   solve, a cost per cell crossed that the cut and the streaming already pay for.
 *
 * At today's 18 m/s clamp a tick is always one substep, so the world steps exactly as before.
 */
import { MAX_PHYSICS_SUBSTEPS, MM_PER_METRE, SUBSTEP_REACH_MM } from '../../constants/physics'
import { boreFollowStepOf, sweptStepOf, type IsSolidAt } from './kinematicSweep'
import { dot, type Vector2 } from './localFrame'

export type TickPlan = { kind: 'substeps'; count: number } | { kind: 'sweep' }

/** A tick's plan and the velocity the body takes through it, m/s. */
export interface PlannedTick {
  plan: TickPlan
  velocity: Vector2
}

/** Where the body is and what it may sweep against, for a tick past the substep budget. */
export interface SweepGround {
  isSolidAt: IsSolidAt
  position: Vector2
  /** The drill's facing as a unit vector while the rig cuts (it follows its bore), else null. */
  boreFacing: Vector2 | null
}

const SUBSTEP_PLANS: readonly TickPlan[] = Array.from({ length: MAX_PHYSICS_SUBSTEPS }, (_, at) =>
  Object.freeze({ kind: 'substeps', count: at + 1 }),
)
const SWEEP_PLAN: TickPlan = Object.freeze({ kind: 'sweep' })

/** The plan for a tick whose motion moves the body `stepMm` mm. */
export function tickPlanOf(stepMm: number): TickPlan {
  const count = Math.max(1, Math.ceil(stepMm / SUBSTEP_REACH_MM))
  return count > MAX_PHYSICS_SUBSTEPS ? SWEEP_PLAN : SUBSTEP_PLANS[count - 1]
}

/**
 * The plan for a tick whose motion rule set `velocity` (m/s) over `dt` seconds: within the substep
 * budget the body keeps that velocity; past it the velocity carries it exactly the swept step.
 */
export function plannedTickOf(velocity: Vector2, dt: number, ground: SweepGround): PlannedTick {
  const plan = tickPlanOf(Math.sqrt(dot(velocity, velocity)) * dt * MM_PER_METRE)
  if (plan.kind === 'substeps') return { plan, velocity }
  const swept = sweptStepOf(ground.isSolidAt, ground.position, tickStepOf(velocity, dt, ground))
  return { plan, velocity: { x: swept.x / dt, y: swept.y / dt } }
}

/** The tick's step: the velocity over `dt`, along the bore only while the rig cuts. */
function tickStepOf(velocity: Vector2, dt: number, ground: SweepGround): Vector2 {
  const step = { x: velocity.x * dt, y: velocity.y * dt }
  return ground.boreFacing === null ? step : boreFollowStepOf(step, ground.boreFacing)
}
