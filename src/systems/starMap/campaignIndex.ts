/**
 * `g = campaignIndex(s, p)` (ticket 754): the campaign index the economy and the generator read for
 * the planet at system `s`, place `p`. The GD lock on #650 (comment 6361556890, TD) has it come
 * from data and equal today's planet index in system 1, so P1 onward stay byte-identical; the VS
 * input (6361573401) has `g` advance by the data's J from one system to the next:
 *
 *   g(s, p) = p + (s - 1) * J        J = `starMap.systemAdvance` (`economy/starMapRules.ts`)
 *
 * Two addresses may share a `g` (planet 1 of system 2 and planet J + 1 of system 1 price alike);
 * their worlds differ, since seeds hash the address itself (`planetAddressSeed.ts`).
 */
import { ECONOMY } from '../economy/economy'
import { assertValidAddress, FIRST_SYSTEM } from './planetAddress'

const MAX_PLANET_INDEX = BigInt(Number.MAX_SAFE_INTEGER)

export function campaignIndex(system: bigint, planet: bigint): bigint {
  assertValidAddress(system, planet)
  return planet + (system - FIRST_SYSTEM) * BigInt(ECONOMY.starMap.systemAdvance)
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
