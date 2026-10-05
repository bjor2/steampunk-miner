/**
 * Combat's debug command intents (#11 amendment), as the store, the debug API and the specs
 * submit them. The offset is in whole tiles from the vehicle's tile.
 */
import type { CommandIntent } from '../authorityCommand'

export interface TileOffset {
  dx: number
  dy: number
}

/** Where `spawnEnemy` puts an enemy when no offset is given: four tiles right, on the lunge's edge. */
export const DEFAULT_SPAWN_OFFSET: TileOffset = { dx: 4, dy: 0 }

export function spawnEnemyCommand(
  kind: string,
  tier: number,
  offset: TileOffset = DEFAULT_SPAWN_OFFSET,
): CommandIntent<'debug.spawnEnemy'> {
  return { type: 'debug.spawnEnemy', payload: { kind, tier, dx: offset.dx, dy: offset.dy } }
}

export function clearEnemiesCommand(): CommandIntent<'debug.clearEnemies'> {
  return { type: 'debug.clearEnemies', payload: {} }
}

export function freezeEnemiesCommand(frozen: boolean): CommandIntent<'debug.freezeEnemies'> {
  return { type: 'debug.freezeEnemies', payload: { frozen } }
}
