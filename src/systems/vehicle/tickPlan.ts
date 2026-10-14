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
import { MAX_PHYSICS_SUBSTEPS, SUBSTEP_REACH_MM } from '../../constants/physics'

export type TickPlan = { kind: 'substeps'; count: number } | { kind: 'sweep' }

const SUBSTEP_PLANS: readonly TickPlan[] = Array.from({ length: MAX_PHYSICS_SUBSTEPS }, (_, at) =>
  Object.freeze({ kind: 'substeps', count: at + 1 }),
)
const SWEEP_PLAN: TickPlan = Object.freeze({ kind: 'sweep' })

/** The plan for a tick whose motion moves the body `stepMm` mm. */
export function tickPlanOf(stepMm: number): TickPlan {
  const count = Math.max(1, Math.ceil(stepMm / SUBSTEP_REACH_MM))
  return count > MAX_PHYSICS_SUBSTEPS ? SWEEP_PLAN : SUBSTEP_PLANS[count - 1]
}
