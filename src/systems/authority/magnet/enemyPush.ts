/**
 * The repulsor coil's push-wave on enemies (GD lock on #246, the repel verb; GD on spec #258 Q5,
 * moved to ticket 284 on 7 Oct): every metal enemy the wave reaches is pushed one cell (1 m) outward
 * from the vehicle that fired it, on the act's tick. An enemy whose kind cannot enter the cell it
 * would land in, or that would land in the tile a rig out on a trip stands in, stays where it is,
 * as a cell with no open cell stays. A frozen enemy does not move; a pinned one is knocked off the
 * drill and lets go on its next tick. Non-metal enemies never feel it.
 *
 * Enemies are integer mm on the tile grid (decision #9), so every machine pushes the same enemy the
 * same way.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { MetalEnemyTags } from '../../economy/economyDefinition'
import { isMetalIn } from '../../economy/metalEnemies'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import { withCombat, type AuthorityState } from '../authorityState'
import type { MillimetrePoint } from '../combat/combatGeometry'
import { withEnemy, type Enemy, type MillimetreStep } from '../combat/combatState'
import { canEnter, type Terrain } from '../combat/enemyMovement'
import { isRigTile, rigTilesAt } from '../magnetic/enemyTug'

/** One push-wave: where it starts, how far it reaches, and the tick it fires on. */
export interface PushWave {
  /** The firing vehicle's centre, in mm. */
  centre: MillimetrePoint
  /** Whole tiles from the vehicle's tile, as the cells' wave measures it. */
  radiusTiles: number
  tick: number
}

export interface EnemyPush {
  state: AuthorityState
  /** The enemies that moved, in roster order. */
  pushedIds: readonly string[]
}

/** Every metal enemy of `tags` the wave reaches, one cell further from the vehicle. */
export function pushMetalEnemies(
  state: AuthorityState,
  terrain: Terrain,
  wave: PushWave,
  tags: MetalEnemyTags,
): EnemyPush {
  if (state.combat.isFrozen) return { state, pushedIds: [] }
  return withPushedEnemies(state, pushedEnemiesOf(state, terrain, wave, tags))
}

function pushedEnemiesOf(
  state: AuthorityState,
  terrain: Terrain,
  wave: PushWave,
  tags: MetalEnemyTags,
): Enemy[] {
  const rigTiles = rigTilesAt(state, wave.tick)
  return state.combat.enemies
    .filter((enemy) => isMetalIn(tags, enemy.kind) && isReachedBy(wave, enemy))
    .map((enemy) => pushedEnemyOf(terrain, wave, enemy, rigTiles))
    .filter((enemy): enemy is Enemy => enemy !== null)
}

/** The enemy's tile lies within the wave's radius of the vehicle's tile. */
function isReachedBy(wave: PushWave, enemy: Enemy): boolean {
  const from = tileOfMillimetres(wave.centre.x, wave.centre.y)
  const at = tileOfMillimetres(enemy.x, enemy.y)
  return distanceSqOf(from, at) <= wave.radiusTiles * wave.radiusTiles
}

/** The enemy one cell outward, or null when it cannot land there. */
function pushedEnemyOf(
  terrain: Terrain,
  wave: PushWave,
  enemy: Enemy,
  rigTiles: readonly TilePoint[],
): Enemy | null {
  const step = outwardStepOf(wave.centre, enemy)
  if (step.x === 0 && step.y === 0) return null
  const landing = { x: enemy.x + step.x, y: enemy.y + step.y }
  if (!canEnter(terrain, enemy.kind, landing) || isRigTile(rigTiles, landing)) return null
  return { ...enemy, ...landing }
}

/** A whole metre from `centre` through `point`; none for a point on the centre itself. */
function outwardStepOf(centre: MillimetrePoint, point: MillimetrePoint): MillimetreStep {
  const dx = point.x - centre.x
  const dy = point.y - centre.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance === 0) return { x: 0, y: 0 }
  return {
    x: Math.trunc((dx * MM_PER_METRE) / distance),
    y: Math.trunc((dy * MM_PER_METRE) / distance),
  }
}

function withPushedEnemies(state: AuthorityState, pushed: readonly Enemy[]): EnemyPush {
  return {
    state: withCombat(state, pushed.reduce(withEnemy, state.combat)),
    pushedIds: pushed.map((enemy) => enemy.id),
  }
}

function distanceSqOf(a: TilePoint, b: TilePoint): number {
  const dx = a.tx - b.tx
  const dy = a.ty - b.ty
  return dx * dx + dy * dy
}
