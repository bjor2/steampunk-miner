/**
 * Combat's `debug.*` commands (#9, #11 amendment): `spawnEnemy(kind, tier, offset)`,
 * `clearEnemies()` and `freezeEnemies(bool)`. They go through `applyCommand` like play, so they
 * replay from `commands.ndjson` and log `debug_command_applied`. A bad kind, a tile off the planet
 * or a vehicle already at its enemy cap is refused with a listed problem.
 */
import { ENEMY_KINDS, type EnemyKind } from '../../economy/economyDefinition'
import { tileOfPose } from '../../vehicle/vehiclePose'
import { isInsidePlanet } from '../../world/planetGeometry'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityCommand } from '../authorityCommand'
import { vehicleOf, withCombat, type AuthorityState } from '../authorityState'
import { firstRejection, rejectionOf, type CommandRule, type Rejection } from '../commandRule'
import { noPlanetRejection, planetParamsOf } from '../planetOfState'
import { DEBUG_SPAWN_POINT_ID } from './combatState'
import { despawnEnemies, hasRoomForEnemy, spawnEnemy } from './enemyRoster'
import { spawnPositionOf } from './spawnPoints'

type SpawnCommand = AuthorityCommand<'debug.spawnEnemy'>

export const COMBAT_DEBUG_RULES: {
  readonly 'debug.spawnEnemy': CommandRule<'debug.spawnEnemy'>
  readonly 'debug.clearEnemies': CommandRule<'debug.clearEnemies'>
  readonly 'debug.freezeEnemies': CommandRule<'debug.freezeEnemies'>
} = {
  'debug.spawnEnemy': {
    fields: { kind: 'text', tier: 'wholeNumber', dx: 'safeInteger', dy: 'safeInteger' },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => kindRejection(command.payload.kind),
        () => placeRejection(state, command),
        () => capRejection(state, command.playerId),
      ]),
    apply: (state, command) =>
      spawnEnemy(
        state,
        {
          kind: command.payload.kind as EnemyKind,
          tier: command.payload.tier,
          spawnPointId: DEBUG_SPAWN_POINT_ID,
          ownerId: command.playerId,
          position: spawnPositionOf(spawnTileOf(state, command) as TilePoint),
        },
        command.tick,
      ),
  },
  'debug.clearEnemies': {
    fields: {},
    apply: (state) => despawnEnemies(state, state.combat.enemies),
  },
  'debug.freezeEnemies': {
    fields: { frozen: 'flag' },
    apply: (state, { payload }) => ({
      state: withCombat(state, { ...state.combat, isFrozen: payload.frozen }),
      events: [],
    }),
  },
}

export function isEnemyKind(kind: unknown): kind is EnemyKind {
  return ENEMY_KINDS.includes(kind as EnemyKind)
}

function kindRejection(kind: string): Rejection | null {
  if (isEnemyKind(kind)) return null
  return rejectionOf(
    'unknown_enemy',
    `${kind} is not a registered enemy kind (${ENEMY_KINDS.join(', ')})`,
  )
}

function placeRejection(state: AuthorityState, command: SpawnCommand): Rejection | null {
  const tile = spawnTileOf(state, command)
  const params = planetParamsOf(state.planet)
  if (tile !== null && params !== null && isInsidePlanet(params, tile.tx, tile.ty)) return null
  return rejectionOf(
    'out_of_range',
    'the enemy must appear on the planet, next to a vehicle with a pose',
  )
}

function capRejection(state: AuthorityState, playerId: string): Rejection | null {
  if (hasRoomForEnemy(state.combat, playerId)) return null
  return rejectionOf('enemy_cap', 'the vehicle already has the most active enemies it may have')
}

function spawnTileOf(state: AuthorityState, command: SpawnCommand): TilePoint | null {
  const { pose } = vehicleOf(state, command.playerId)
  if (pose === null) return null
  const tile = tileOfPose(pose)
  return { tx: tile.tx + command.payload.dx, ty: tile.ty + command.payload.dy }
}
