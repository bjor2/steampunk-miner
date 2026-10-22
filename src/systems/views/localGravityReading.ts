/**
 * Gravity as the player reads it (Bjor's ruling on #724, HS), a multiple of planet 1's surface
 * gravity, "1.25 g", through the shared number formatter (#681):
 * - on the vehicle panel, the pull where the vehicle stands, `g(r)` of `radialGravity.ts`, what
 *   caps a cut down's gain of speed, so the player can read why a dig near the core starts slowly;
 * - as a planet's trait on the planet row and the travel screen, its surface gravity from the
 *   planet-row registry (#707).
 * Display only.
 */
import { BASE_GRAVITY, MM_PER_METRE } from '../../constants/physics'
import type { AuthorityState } from '../authority/authorityState'
import { planetParamsOf } from '../authority/planetOfState'
import { exactAmount, formatAmount } from '../displayAmount'
import { fromFiniteNumber } from '../money'
import { planetRowOf } from '../registries/planetRow'
import { gravityStrengthAt } from '../vehicle/radialGravity'

export interface LocalGravityReading {
  /** "1.25 g". */
  text: string
  /** The multiple in full, canonical. */
  exact: string
}

/** The pull at the reported pose; null with no pose or no generated planet. */
export function localGravityReadingOf(
  state: AuthorityState,
  playerId: string,
): LocalGravityReading | null {
  const pose = state.players[playerId].vehicle.pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return null
  const radius = Math.sqrt(pose.x * pose.x + pose.y * pose.y) / MM_PER_METRE
  const pull = gravityStrengthAt(radius, params.radiusTiles, params.gravityMultiplier)
  return gravityMultipleReadingOf(pull / BASE_GRAVITY)
}

/** A planet's surface gravity as its trait, from its row. */
export function planetGravityTraitOf(planetIndex: number): LocalGravityReading {
  return gravityMultipleReadingOf(planetRowOf(planetIndex).gravityMultiplier)
}

/** A multiple of planet 1's gravity as the panel and the planet trait print it. */
export function gravityMultipleReadingOf(multiple: number): LocalGravityReading {
  const amount = fromFiniteNumber(multiple)
  return { text: `${formatAmount(amount)} g`, exact: exactAmount(amount) }
}
