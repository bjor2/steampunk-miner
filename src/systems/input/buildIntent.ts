/**
 * `buildIntent` (#33 section 1, revised by #40): the held actions, in the order they were
 * pressed, become the vehicle intent. It takes no camera and no world: directions are the
 * vehicle's local frame (#7), so the rotating or fixed camera cannot change what an input does.
 *
 * Swivel rule (#7, #40): the facing sources are `aim_left`, `aim_right`, `aim_down` and `lift`;
 * the latest held one sets the facing and a release falls back to the one still held (none held
 * keeps the last facing in the controller). `aim_left` and `aim_right` also drive, the one pressed
 * last winning. `lift` fires the steam-lift thruster and turns the head up, unless `aim_down` was
 * pressed after it: the newest of the two wins, and `aim_down` never thrusts. No drill button.
 */
import type { VehicleIntent } from '../vehicle/vehicleIntent'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { ActionId } from './actionMap'

const FACING_OF_SOURCE: Readonly<Partial<Record<ActionId, Facing>>> = {
  aim_left: FACING.left,
  aim_right: FACING.right,
  aim_down: FACING.down,
  lift: FACING.up,
}

/** `held` lists the held actions in the order they were pressed, the latest last. */
export function buildIntent(held: readonly ActionId[]): VehicleIntent {
  const facings = held.flatMap((action) => FACING_OF_SOURCE[action] ?? [])
  return {
    moveX: moveOf(facings),
    facing: facings.at(-1) ?? null,
    lift: isLifting(held),
  }
}

function moveOf(facings: readonly Facing[]): -1 | 0 | 1 {
  const sideways = facings.filter((facing) => facing === FACING.left || facing === FACING.right)
  if (sideways.length === 0) return 0
  return sideways.at(-1) === FACING.right ? 1 : -1
}

/** Lift is held and drill down is not held after it (#40: the later of W and S wins). */
function isLifting(held: readonly ActionId[]): boolean {
  return held.includes('lift') && held.lastIndexOf('lift') > held.lastIndexOf('aim_down')
}
