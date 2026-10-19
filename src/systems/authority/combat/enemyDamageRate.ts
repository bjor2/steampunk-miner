/**
 * The one damage seam between a rig and the enemies its drill meets (ticket 564, the TD ruling on
 * #551 6254978633 after the Vertical Scaler's objection): the pinned drill, the burrowers cut in the
 * nose tile and the nose contact's dwell all read this rate, never drill power directly. Today it
 * is what #9 pins with, `drillPower * kDrillVsEnemy` per second; the combat damage track (#565)
 * swaps its source for Systems' `Dc(q)` here and nowhere else.
 */
import { drillDamagePerSecond } from '../../economy/enemyStats'
import { drillPowerAtStep } from '../../economy/vehicleStats'
import type { BigStat } from '../../money'
import { vehicleOf, type AuthorityState } from '../authorityState'

/** The damage per second `playerId`'s rig deals an enemy on its drill. */
export function enemyDamageRate(state: AuthorityState, playerId: string): BigStat {
  return drillDamagePerSecond(drillPowerAtStep(vehicleOf(state, playerId).levels.drill_power))
}
