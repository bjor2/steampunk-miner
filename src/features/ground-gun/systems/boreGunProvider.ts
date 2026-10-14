/**
 * The bore gun the kernel's `ground_gun.fire` reads (ticket 313's `boreGun` seam, ticket 314): a
 * player's track levels turned into the provider's whole numbers. The rate level gives the
 * cooldown and `kGunPct` the shot fires with; penetration gives `gunFactor` and energy the share
 * of the drill's dig energy, both from #322's percents into the kernel's basis points. Cell
 * interval and shot budget are the bore's fixed numbers; the long barrel on the gun (ticket 318)
 * sets its reach and adds its Marks' hold to the bore's. A player who has not mounted the gun has
 * none, so every fire is refused. The steam sear on the gun answers auto mode (ticket 317's
 * `autoShootOf`); without it the mode holds unavailable.
 *
 * The forced pacing bot (`balance:bore`, ticket 347) starts with the gun mounted at every track's
 * wall, through the free debug command the provider names, so the run never counts as play.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { BoreGunProvider, BoreGunStats } from '../../../systems/registries/boreGun'
import { longBarrelOf, searAutoShootOf } from './boreGunModules'
import type { LongBarrelStep } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'
import { gunLevelsOf, isGunMounted, type GunLevels } from './gunLevels'
import { SET_LEVELS_COMMAND } from './gunPurchase'
import { energyStatsAt, penetrationStatsAt, rateStatsAt, wallLevelOf } from './gunTracks'

const BP_PER_PERCENT = 100

export const GROUND_GUN_PROVIDER: BoreGunProvider = {
  id: 'ground-gun.bore-gun',
  boreGunOf: playerBoreGunOf,
  autoShootOf: searAutoShootOf,
  wallsMountIntent: () => ({ type: SET_LEVELS_COMMAND, payload: wallLevels() }),
}

/** The gun this player fires now, with the long barrel it carries; null before the mount. */
export function playerBoreGunOf(state: AuthorityState, playerId: string): BoreGunStats | null {
  return boreGunStatsOf(gunLevelsOf(state, playerId), longBarrelOf(state, playerId))
}

/** Every track at its last level: the gun the forced bot fires. */
export function wallLevels(): GunLevels {
  return {
    rate: wallLevelOf('rate'),
    penetration: wallLevelOf('penetration'),
    energy: wallLevelOf('energy'),
  }
}

/** The gun these levels fire with this long barrel (none: the bore's own reach and hold). */
export function boreGunStatsOf(
  levels: GunLevels,
  barrel: LongBarrelStep | null = null,
): BoreGunStats | null {
  if (!isGunMounted(levels)) return null
  const rate = rateStatsAt(levels.rate)
  const { bore } = GROUND_GUN
  return {
    rangeCells: barrel?.rangeCells ?? bore.boreRangeBase,
    openIntervalTicks: bore.openIntervalTicks,
    cooldownTicks: rate.cooldownTicks,
    kGunPct: rate.kGunPct,
    gunFactorBp: penetrationStatsAt(levels.penetration).gunFactorPct * BP_PER_PERCENT,
    boreBudgetTicks: bore.shotDigTicks,
    energyPerCellBp: energyStatsAt(levels.energy).energyPerCellPct * BP_PER_PERCENT,
    collapseHoldTicks: bore.collapseHoldTicks + (barrel?.holdTicks ?? 0),
  }
}
