/**
 * The felt speed the strip's window follows (TD scope d on #316: `vCam`, an exponential average
 * over 0.5 s of the rig's speed along the drive), so one hard cell doesn't make the window pump.
 * Presentation only; time comes in as `dt`.
 */
import { FELT_SPEED_SECONDS } from '../../../constants/hazardStrip'
import type { Vector2 } from '../../vehicle/localFrame'

/** The speed along the drill's facing, metres a second; backing away counts as none. */
export function speedAlongFacing(velocity: Vector2, facing: Vector2): number {
  return Math.max(0, velocity.x * facing.x + velocity.y * facing.y)
}

/** The felt speed after `dt` seconds more of `speed`. */
export function feltSpeedAfter(felt: number, speed: number, dt: number): number {
  return felt + (speed - felt) * (1 - Math.exp(-dt / FELT_SPEED_SECONDS))
}
