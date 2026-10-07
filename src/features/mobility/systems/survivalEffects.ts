/**
 * The survival items on ticket 233's seams, each read from the player's `mobility` section:
 *
 * - The steam shield's curtain turns aside enemy hits and collapse crush while it stands
 *   (`hullDamageIntercepts`); heat and lava are never asked, so it never stops them (#162 row).
 * - A smoke cloud blinds every enemy in it, and hides a miner standing in it
 *   (`enemyDetectionModifiers`); it adds no enemy and changes no spawn budget.
 * - A heat sink flask's window vents the gauge and pauses heat gain (`heatPauses`).
 *
 * The kernel floors each scale (`itemEffectCaps`, ticket 233), so the shield takes at most half a
 * hit, the smoke halves an enemy's reach, and the flask vents at most half the gauge.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import type { EnemyDetectionModifier } from '../../../systems/registries/enemyDetectionModifiers'
import type { HeatPause } from '../../../systems/registries/heatPauses'
import type { HullDamageIntercept } from '../../../systems/registries/hullDamageIntercepts'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { mobilityOf, type SmokeCloud } from './mobilitySection'

export const STEAM_SHIELD_INTERCEPT: HullDamageIntercept = {
  id: 'mobility.steam-shield',
  damageScaleBpOf: (state, playerId, _source, tick) =>
    tick < mobilityOf(state, playerId).shieldUntilTick
      ? MOBILITY_ECONOMY.steamShield.damageScaleBp
      : null,
}

export const SMOKE_DETECTION: EnemyDetectionModifier = {
  id: 'mobility.smoke-canister',
  detectionScaleBpOf: (state, playerId, enemy, tick) => {
    const smoke = mobilityOf(state, playerId).smoke
    if (smoke === null || tick >= smoke.untilTick) return null
    if (!isEnemyOrMinerInCloud(state, playerId, enemy, smoke)) return null
    return MOBILITY_ECONOMY.smoke.detectionScaleBp
  },
}

export const HEAT_SINK_PAUSE: HeatPause = {
  id: 'mobility.heat-sink-flask',
  pausesOf: (state, playerId) => mobilityOf(state, playerId).heatSinks,
}

function isEnemyOrMinerInCloud(
  state: AuthorityState,
  playerId: string,
  enemy: Enemy,
  smoke: SmokeCloud,
): boolean {
  const pose = vehicleOf(state, playerId).pose
  return isInCloud(enemy.x, enemy.y, smoke) || (pose !== null && isInCloud(pose.x, pose.y, smoke))
}

function isInCloud(x: number, y: number, smoke: SmokeCloud): boolean {
  const radius = MOBILITY_ECONOMY.smoke.radiusTiles * MM_PER_METRE
  const dx = x - smoke.x
  const dy = y - smoke.y
  return dx * dx + dy * dy <= radius * radius
}
