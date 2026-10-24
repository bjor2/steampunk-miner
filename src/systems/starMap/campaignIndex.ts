/**
 * `g = campaignIndex(s, p)` (ticket 754): the campaign index the economy and the generator read for
 * the planet at system `s`, place `p`. The GD lock on #650 (comment 6361556890, TD) has it come
 * from data and equal today's planet index in system 1, so P1 onward stay byte-identical. The TD
 * ruling on ticket 781 makes it gap-free: a system's first planet follows the last planet of the
 * system before, one planet's value step on, as any p to p + 1 is (VS: no value step at the jump).
 *
 *   g(s, p) = planetsBefore(s) + p      planetsBefore(s) = (s - 1) * N
 *
 * N = `starMap.planetsPerSystem` (`economy/starMapRules.ts`), equal for every system, so the prefix
 * sum is closed-form and O(1) in bigint at any `s`. System 1's line keeps every planet from 1, so
 * an address past N there may share a `g` with a later system's planet (planet 6 of system 1 and
 * planet 1 of system 2 price alike); their worlds differ, since seeds hash the address itself
 * (`planetAddressSeed.ts`).
 */
import { ECONOMY } from '../economy/economy'
import { assertValidAddress, FIRST_SYSTEM } from './planetAddress'

const MAX_PLANET_INDEX = BigInt(Number.MAX_SAFE_INTEGER)

export function campaignIndex(system: bigint, planet: bigint): bigint {
  assertValidAddress(system, planet)
  return planetsBefore(system) + planet
}

/** The planets of every system before `system`: the per-system count's prefix sum. */
export function planetsBefore(system: bigint): bigint {
  return (system - FIRST_SYSTEM) * BigInt(ECONOMY.starMap.planetsPerSystem)
}

/** The place `p` of campaign index `index` in system `system`: the inverse of `campaignIndex`. */
export function placeOfCampaign(system: bigint, index: bigint): bigint {
  return index - planetsBefore(system)
}

/**
 * The campaign index as the safe-integer `planetIndex` today's economy and generator take (#5:
 * bounded indices are numbers); throws past the safe range rather than rounding to a neighbour.
 */
export function planetIndexOfCampaign(index: bigint): number {
  if (index < 1n || index > MAX_PLANET_INDEX) {
    throw new RangeError(`campaign index ${index} has no safe-integer planet index`)
  }
  return Number(index)
}

/** The safe-integer planet index of the address, or null where it would pass the safe range. */
export function planetIndexAt(system: bigint, planet: bigint): number | null {
  const index = campaignIndex(system, planet)
  return index > MAX_PLANET_INDEX ? null : planetIndexOfCampaign(index)
}
