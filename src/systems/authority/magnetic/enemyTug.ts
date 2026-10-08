/**
 * A field's tug on metal enemies (GD lock on spec #258 Q2 and Q5, ticket 291). A metal enemy
 * inside a field is pulled toward the field's vein by the share of its own walking speed the rig
 * feels of its engine (10%, `enemyTugStepMmOf`), once a combat tick after it has acted. The tug
 * never moves it into a cell its kind cannot enter, nor into the cell a rig out on a trip stands
 * in. A pinned enemy is held on the drill and a frozen one does not move, so neither is tugged.
 *
 * Fields come from the planet seed and enemies are integer mm, so every machine tugs the same
 * enemy the same way (#258 Q8).
 */
import { enemyTugStepMmOf } from '../../economy/magneticHazard'
import type { MetalEnemyTags } from '../../economy/economyDefinition'
import { isMetalIn } from '../../economy/metalEnemies'
import { MM_PER_METRE } from '../../../constants/physics'
import { magneticFieldHolding } from '../../registries/magneticGround'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import { withCombat, type AuthorityState } from '../authorityState'
import { stepToward, type MillimetrePoint } from '../combat/combatGeometry'
import { withEnemy, type CombatState, type Enemy } from '../combat/combatState'
import { canEnter, walkStepMmOf, type Terrain } from '../combat/enemyMovement'
import { vehicleTargetOf } from '../combat/vehicleTarget'

/** Every metal enemy of `tags` one tug further toward its field's vein. */
export function tugMetalEnemies(
  state: AuthorityState,
  terrain: Terrain,
  tick: number,
  tags: MetalEnemyTags,
): AuthorityState {
  if (state.combat.isFrozen) return state
  const rigTiles = rigTilesAt(state, tick)
  const tugged = tuggableEnemiesOf(state.combat, tags).map((enemy) =>
    tuggedEnemy(terrain, enemy, rigTiles),
  )
  return withCombat(state, withEveryEnemy(state.combat, tugged))
}

function tuggableEnemiesOf(combat: CombatState, tags: MetalEnemyTags): Enemy[] {
  return combat.enemies.filter((enemy) => enemy.phase !== 'pinned' && isMetalIn(tags, enemy.kind))
}

/** The tiles of the rigs out on a trip, where they stand at the tick. */
function rigTilesAt(state: AuthorityState, tick: number): TilePoint[] {
  return Object.keys(state.players)
    .map((playerId) => vehicleTargetOf(state, playerId, tick))
    .filter((target) => target !== null)
    .map((target) => tileOfMillimetres(target.position.x, target.position.y))
}

function tuggedEnemy(terrain: Terrain, enemy: Enemy, rigTiles: readonly TilePoint[]): Enemy {
  const field = magneticFieldHolding(terrain.params, tileOfMillimetres(enemy.x, enemy.y))
  if (field === null) return enemy
  const moved = pulledToward(enemy, centreOfTile(field.vein))
  return canEndTugAt(terrain, enemy, moved, rigTiles) ? { ...enemy, ...moved } : enemy
}

function pulledToward(enemy: Enemy, vein: MillimetrePoint): MillimetrePoint {
  const step = stepToward(enemy, vein, enemyTugStepMmOf(walkStepMmOf(enemy)))
  return { x: enemy.x + step.x, y: enemy.y + step.y }
}

function canEndTugAt(
  terrain: Terrain,
  enemy: Enemy,
  point: MillimetrePoint,
  rigTiles: readonly TilePoint[],
): boolean {
  return canEnter(terrain, enemy.kind, point) && !isRigTile(rigTiles, point)
}

function isRigTile(rigTiles: readonly TilePoint[], point: MillimetrePoint): boolean {
  const tile = tileOfMillimetres(point.x, point.y)
  return rigTiles.some((rig) => rig.tx === tile.tx && rig.ty === tile.ty)
}

function centreOfTile(tile: TilePoint): MillimetrePoint {
  return {
    x: tile.tx * MM_PER_METRE + MM_PER_METRE / 2,
    y: tile.ty * MM_PER_METRE + MM_PER_METRE / 2,
  }
}

function withEveryEnemy(combat: CombatState, enemies: readonly Enemy[]): CombatState {
  return enemies.reduce(withEnemy, combat)
}
