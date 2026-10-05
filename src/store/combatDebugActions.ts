/**
 * The game store's combat debug actions (#9, #11 amendment), kept beside the store so it stays one
 * reason to change: each submits a `debug.*` authority command, so it replays and logs
 * `debug_command_applied`, and a call the authority would refuse throws with its problems.
 */
import {
  clearEnemiesCommand,
  freezeEnemiesCommand,
  spawnEnemyCommand,
  type TileOffset,
} from '../systems/authority/combat/combatCommands'
import { submitUnlessRefused } from './authorityLink'

export interface CombatDebugActions {
  /** Debug: an enemy of `kind` and `tier`, `offset` whole tiles from the local vehicle. */
  spawnEnemy(kind: string, tier: number, offset?: TileOffset): void
  /** Debug: every active enemy leaves. */
  clearEnemies(): void
  /** Debug: frozen enemies neither move, attack nor spawn; the drill still cuts them. */
  freezeEnemies(frozen: boolean): void
}

export function combatDebugActionsOf(playerIdOf: () => string): CombatDebugActions {
  return {
    spawnEnemy: (kind, tier, offset) =>
      submitUnlessRefused(playerIdOf(), spawnEnemyCommand(kind, tier, offset)),
    clearEnemies: () => submitUnlessRefused(playerIdOf(), clearEnemiesCommand()),
    freezeEnemies: (frozen) => submitUnlessRefused(playerIdOf(), freezeEnemiesCommand(frozen)),
  }
}
