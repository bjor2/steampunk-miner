/**
 * The bore gun the kernel's `ground_gun.fire` reads (ticket 313's `boreGun` seam, ticket 314): a
 * player's track levels turned into the provider's whole numbers. The rate level gives the
 * cooldown and `kGunPct` the shot fires with; penetration gives `gunFactor` and energy the share
 * of the drill's dig energy, both from #322's percents into the kernel's basis points. Range,
 * cell interval, shot budget and hold are the bore's fixed numbers until the long barrel (#318)
 * adds its Marks. A player who has not mounted the gun has none, so every fire is refused.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { BoreGunProvider, BoreGunStats } from '../../../systems/registries/boreGun'
import { GROUND_GUN } from './groundGunEconomy'
import { gunLevelsOf, isGunMounted, type GunLevels } from './gunLevels'
import { energyStatsAt, penetrationStatsAt, rateStatsAt } from './gunTracks'

const BP_PER_PERCENT = 100

export const GROUND_GUN_PROVIDER: BoreGunProvider = {
  id: 'ground-gun.bore-gun',
  boreGunOf: (state: AuthorityState, playerId: string) =>
    boreGunStatsOf(gunLevelsOf(state, playerId)),
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
