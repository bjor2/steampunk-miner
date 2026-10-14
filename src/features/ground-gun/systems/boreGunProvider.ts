/**
 * The bore gun the kernel's `ground_gun.fire` reads (ticket 313's `boreGun` seam, ticket 314): a
 * player's track levels turned into the provider's whole numbers. The rate level gives the
 * cooldown and `kGunPct` the shot fires with; penetration gives `gunFactor` and energy the share
 * of the drill's dig energy, both from #322's percents into the kernel's basis points. Range,
 * cell interval, shot budget and hold are the bore's fixed numbers until the long barrel (#318)
 * adds its Marks. A player who has not mounted the gun has none, so every fire is refused.
 *
 * The forced pacing bot (`balance:bore`, ticket 347) starts with the gun mounted at every track's
 * wall, through the free debug command the provider names, so the run never counts as play.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { BoreGunProvider, BoreGunStats } from '../../../systems/registries/boreGun'
import { GROUND_GUN } from './groundGunEconomy'
import { gunLevelsOf, isGunMounted, type GunLevels } from './gunLevels'
import { SET_LEVELS_COMMAND } from './gunPurchase'
import { energyStatsAt, penetrationStatsAt, rateStatsAt, wallLevelOf } from './gunTracks'

const BP_PER_PERCENT = 100

export const GROUND_GUN_PROVIDER: BoreGunProvider = {
  id: 'ground-gun.bore-gun',
  boreGunOf: (state: AuthorityState, playerId: string) =>
    boreGunStatsOf(gunLevelsOf(state, playerId)),
  wallsMountIntent: () => ({ type: SET_LEVELS_COMMAND, payload: wallLevels() }),
}

/** Every track at its last level: the gun the forced bot fires. */
export function wallLevels(): GunLevels {
  return {
    rate: wallLevelOf('rate'),
    penetration: wallLevelOf('penetration'),
    energy: wallLevelOf('energy'),
  }
}

/** The gun these levels fire, or null before the mount. */
export function boreGunStatsOf(levels: GunLevels): BoreGunStats | null {
  if (!isGunMounted(levels)) return null
  const rate = rateStatsAt(levels.rate)
  const { bore } = GROUND_GUN
  return {
    rangeCells: bore.boreRangeBase,
    openIntervalTicks: bore.openIntervalTicks,
    cooldownTicks: rate.cooldownTicks,
    kGunPct: rate.kGunPct,
    gunFactorBp: penetrationStatsAt(levels.penetration).gunFactorPct * BP_PER_PERCENT,
    boreBudgetTicks: bore.shotDigTicks,
    energyPerCellBp: energyStatsAt(levels.energy).energyPerCellPct * BP_PER_PERCENT,
    collapseHoldTicks: bore.collapseHoldTicks,
  }
}
