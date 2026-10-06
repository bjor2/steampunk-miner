/**
 * How enemies move on the tile grid (decision #9 "Enemy simulation": simple movement only).
 *
 * - A crawler walks over open cells: cave air and bored tunnels inside the disc, never through
 *   rock and never out into space.
 * - A burrower swims through any cell inside the disc and removes no tiles; so does a tunnel
 *   wrecker, which flees into the rock (#111).
 *
 * Walking is greedy: straight at the target, or along one axis when the straight step is blocked.
 * Lunges and recoils keep the step fixed when they start and stop at the first blocked cell.
 * Speeds are the #6 bounded stats as whole mm per tick.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../../constants/physics'
import type { EnemyKind } from '../../economy/economyDefinition'
import { enemyBoundedStats } from '../../economy/enemyStats'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import { isInsidePlanet } from '../../world/planetGeometry'
import type { PlanetParams } from '../../world/planetParams'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, type WorldState } from '../../world/worldState'
import type { MillimetrePoint } from './combatGeometry'
import { stepToward } from './combatGeometry'
import type { Enemy, MillimetreStep } from './combatState'

export interface Terrain {
  world: WorldState
  params: PlanetParams
}

export function walkStepMmOf(enemy: Enemy): number {
  return mmPerTick(enemyBoundedStats(enemy.kind, enemy.tier).moveTilesPerSecond)
}

/** A lunge covers `lungeTiles` in `lungeTicks` (#9: at most 6 tiles in at most 30 ticks). */
export function lungeStepMmOf(enemy: Enemy): number {
  const { lungeTiles, lungeTicks } = enemyBoundedStats(enemy.kind, enemy.tier)
  return Math.floor((lungeTiles * MM_PER_METRE) / lungeTicks)
}

/** One walking step toward `target`, or the enemy unmoved when every greedy step is blocked. */
export function walkToward(terrain: Terrain, enemy: Enemy, target: MillimetrePoint): Enemy {
  const step = stepToward(enemy, target, walkStepMmOf(enemy))
  const tries: MillimetreStep[] = [step, ...axisStepsOf(step)]
  const open = tries.find((candidate) => canEnter(terrain, enemy.kind, movedBy(enemy, candidate)))
  return open === undefined ? enemy : { ...enemy, ...movedBy(enemy, open) }
}

/** One step of a lunge or recoil; null when the cell ahead is closed to this kind. */
export function stepAlong(terrain: Terrain, enemy: Enemy): Enemy | null {
  const next = movedBy(enemy, enemy.step)
  return canEnter(terrain, enemy.kind, next) ? { ...enemy, ...next } : null
}

export function canEnter(terrain: Terrain, kind: EnemyKind, point: MillimetrePoint): boolean {
  const tile = tileOfMillimetres(point.x, point.y)
  if (isRockSwimmer(kind)) return isInsidePlanet(terrain.params, tile.tx, tile.ty)
  return kindOfCell(cellAt(terrain.world, terrain.params, tile)) === CELL_KIND.air
}

function isRockSwimmer(kind: EnemyKind): boolean {
  return kind === 'burrower' || kind === 'tunnel_wrecker'
}

function mmPerTick(tilesPerSecond: number): number {
  return Math.floor((tilesPerSecond * MM_PER_METRE) / TICKS_PER_SECOND)
}

/** The straight step split into its axes, the longer first. */
function axisStepsOf(step: MillimetreStep): MillimetreStep[] {
  const alongX = { x: step.x, y: 0 }
  const alongY = { x: 0, y: step.y }
  return Math.abs(step.x) >= Math.abs(step.y) ? [alongX, alongY] : [alongY, alongX]
}

function movedBy(point: MillimetrePoint, step: MillimetreStep): MillimetrePoint {
  return { x: point.x + step.x, y: point.y + step.y }
}
