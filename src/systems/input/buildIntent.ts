/**
 * `buildIntent` (#33 section 1): the held actions, in the order they were pressed, become the
 * vehicle intent. It takes no camera and no world: directions are the vehicle's local frame
 * (#7), so the rotating or fixed camera cannot change what an input does.
 *
 * Swivel rule (#7, #33 section 2): the latest pushed `aim_*` sets the facing and a release keeps
 * the last one (the drill head holds it); `aim_left` and `aim_right` also drive, the one pressed
 * last winning; `lift` fires the steam-lift thruster. There is no drill button.
 */
import type { VehicleIntent } from '../vehicle/vehicleIntent'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { ActionId } from './actionMap'

const FACING_OF_AIM: Readonly<Partial<Record<ActionId, Facing>>> = {
  aim_left: FACING.left,
  aim_right: FACING.right,
  aim_down: FACING.down,
  aim_up: FACING.up,
}

/** `held` lists the held actions in the order they were pressed, the latest last. */
export function buildIntent(held: readonly ActionId[]): VehicleIntent {
  const aims = held.flatMap((action) => FACING_OF_AIM[action] ?? [])
  return {
    moveX: moveOf(aims),
    facing: aims.at(-1) ?? null,
    lift: held.includes('lift'),
  }
}

function moveOf(aims: readonly Facing[]): -1 | 0 | 1 {
  const sideways = aims.filter((facing) => facing === FACING.left || facing === FACING.right)
  if (sideways.length === 0) return 0
  return sideways.at(-1) === FACING.right ? 1 : -1
}
