/**
 * What the shipped `bore_gun` modules do to the gun (ticket 318, the GD decision on #310), read
 * from the player's ownership and researched Mark: a module acts once it is bought, at the highest
 * Mark researched (Mark 1, the item as bought, before any Mark node).
 *
 * - Long barrel: the bore's reach and its hold before the collapse check (`boreLadders.ts`).
 * - Steam sear: auto mode's numbers for the kernel (ticket 317's `autoShootOf`): the 10-tick
 *   preview, the wait after a manual shot (its Mark stat, never under the GD's floor of 20), the
 *   reserve above the rescue floor, and whether the trip's income cap is used up (Systems'
 *   guardrail: auto holds and scores ore at 0).
 * - Gimbal sight: how often its pick may change (`retargetTicks`), read by the fire input.
 */
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { cmp, fromCanonical, ZERO_MONEY } from '../../../systems/money'
import type { BoreAutoShootStats } from '../../../systems/registries/boreGun'
import { incomeTripOf, roomUnderCapOf } from '../../extraction'
import { researchedMarkOf } from '../../tech-tree'
import { moduleStatsAt } from './armouryModules'
import { GIMBAL_SIGHT_ITEM_ID, LONG_BARREL_ITEM_ID } from './boreGunLane'
import { longBarrelAt, type LongBarrelStep } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

const BOUGHT_MARK = 1

/** The Mark the player plays the module at: 0 while not owned. */
export function ownedModuleMarkOf(state: AuthorityState, playerId: string, itemId: string): number {
  if (!ownsItem(state, playerId, itemId)) return 0
  return Math.max(BOUGHT_MARK, researchedMarkOf(state, playerId, itemId))
}

/** The long barrel's step on this player's gun, or null without one. */
export function longBarrelOf(state: AuthorityState, playerId: string): LongBarrelStep | null {
  const mark = ownedModuleMarkOf(state, playerId, LONG_BARREL_ITEM_ID)
  return mark === 0 ? null : longBarrelAt(mark)
}

/** Auto mode's numbers once the sear is on the gun; null before, so the mode holds unavailable. */
export function searAutoShootOf(
  state: AuthorityState,
  playerId: string,
): BoreAutoShootStats | null {
  const mark = ownedModuleMarkOf(state, playerId, STEAM_SEAR_ITEM_ID)
  if (mark === 0) return null
  const { previewTicks, reserveAboveRescueBp } = GROUND_GUN.autoShoot
  return {
    previewTicks,
    manualWaitTicks: searWaitTicksAt(mark),
    reserveAboveRescueBp,
    isIncomeCapUsed: isIncomeCapUsed(state, playerId),
  }
}

/** The wait after a manual shot at this sear Mark, never under the GD's floor. */
export function searWaitTicksAt(mark: number): number {
  const wait = moduleStatsAt(STEAM_SEAR_ITEM_ID, mark).stats.manualWaitTicks
  return Math.max(GROUND_GUN.autoShoot.manualWaitFloorTicks, wait)
}

/** Ticks the sight holds one pick at this Mark before it may look again. */
export function sightRetargetTicksAt(mark: number): number {
  return moduleStatsAt(GIMBAL_SIGHT_ITEM_ID, mark).stats.retargetTicks
}

/** The sight's Mark on the player's gun: 0 without one. */
export function sightMarkOf(state: AuthorityState, playerId: string): number {
  return ownedModuleMarkOf(state, playerId, GIMBAL_SIGHT_ITEM_ID)
}

/** A trip cap is set and the income items have filled it (`roomUnderCapOf` = 0). */
function isIncomeCapUsed(state: AuthorityState, playerId: string): boolean {
  const trip = incomeTripOf(state, playerId)
  const cap = fromCanonical(trip.tripCap)
  if (cmp(cap, ZERO_MONEY) <= 0) return false
  return cmp(roomUnderCapOf(fromCanonical(trip.incomeItemValue), cap), ZERO_MONEY) <= 0
}
