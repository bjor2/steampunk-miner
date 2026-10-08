/**
 * The metal enemy tag (GD lock on spec #258 Q5, ticket 291), the `enemies.metal` table of
 * economy.json: a metal enemy feels a magnetic field's tug and is what the repulsor's push-wave
 * (#284) hits. `emp_mite` is the first metal family.
 */
import { ECONOMY } from './economy'
import type { MetalEnemyTags } from './economyDefinition'

/** Whether `tags` call `enemyId` metal; an enemy they do not name is not. */
export function isMetalIn(tags: MetalEnemyTags, enemyId: string): boolean {
  return tags[enemyId] === true
}

/** Whether `enemyId` is metal by the committed tags. */
export function isMetalEnemy(enemyId: string): boolean {
  return isMetalIn(ECONOMY.enemies.metal, enemyId)
}
