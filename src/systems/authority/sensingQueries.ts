/**
 * What the authority can sense for a combo (GD lock on #206, TD ruling Q2; ticket 323): pure reads
 * of the saved state with no new field, in the kernel because a combo may not import the sensing
 * slice, whose periscope and echo are render-only.
 *
 * - `lungeWarningsOf`: the enemies hunting this player that are winding up a lunge inside the
 *   radius, nearest first, then by id; one look at each enemy. The alarm shield fires on a hit.
 * - `densestOreClusterOf`: among the ore cells of the disc a drag may move, the one whose 3x3
 *   block holds the most of them inside the disc; ties go to the higher sale value, then row-major
 *   `(ty, tx)`. The radius is held to `itemHookCaps.reachCellsMax`, so a call reads at most the
 *   441 tiles of a twelve-tile disc, each once. The magnetic survey drags toward it.
 *
 * "A drag may move" is the kernel's share of the ore-shifter's rule: an ore cell with ground left
 * in it, no casing, and no gate holding it against the tool (`canMine`'s tool column). A core cell
 * is never ore. The ore-shifter's own anchor rule (no cell within 1 m of a vehicle) stays with its
 * drag, which skips such a cell wherever the cluster lies.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { ECONOMY } from '../economy/economy'
import type { EnemyKind } from '../economy/economyDefinition'
import { oreSalePrice } from '../economy/oreEconomy'
import { cmp, type Money } from '../money'
import { gateVerdictOf, type GateQuery } from '../registries/gateChecks'
import { oreTypeOf, saleTierOf } from '../registries/oreTypes'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { isCellLined } from '../world/casingLining'
import { cellDensitySum } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import { tilesWithin } from '../world/tileDisc'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import type { Enemy } from './combat/combatState'
import { resourceTierOf } from './minedOre'
import { planetParamsOf } from './planetOfState'

export interface LungeWarning {
  enemyId: string
  kind: EnemyKind
}

/** Who drags: the player and the tool asking the gates, by its terrain edit's `source`. */
export interface OreDragAsker {
  playerId: string
  tool: string
}

/** An ore cell a drag may move, read once. */
export interface DraggableOre {
  saleValue: Money
}

/** The ground as a drag sees it: one read per tile. */
export interface OreDragGround {
  draggableOreAt(tile: TilePoint): DraggableOre | null
}

export interface OreCluster {
  tile: TilePoint
  /** Draggable ore cells in its 3x3 block inside the disc, itself included. */
  score: number
}

interface Sighting {
  enemy: Enemy
  distanceSq: number
}

interface DiscOre extends DraggableOre {
  tile: TilePoint
}

interface ClusterCandidate extends OreCluster {
  saleValue: Money
}

/** Every enemy winding up on `playerId` within the radius, nearest first, then by id. */
export function lungeWarningsOf(
  state: AuthorityState,
  playerId: string,
  radiusTiles: number,
): LungeWarning[] {
  const pose = state.players[playerId]?.vehicle.pose ?? null
  if (pose === null) return []
  const radiusMm = radiusTiles * MM_PER_METRE
  return state.combat.enemies
    .filter((enemy) => isWindingUpOn(enemy, playerId))
    .map((enemy) => sightingOf(pose, enemy))
    .filter((sighting) => sighting.distanceSq <= radiusMm * radiusMm)
    .sort(compareNearestFirst)
    .map(({ enemy }) => ({ enemyId: enemy.id, kind: enemy.kind }))
}

/** The densest draggable ore cluster of the disc; null off a planet or with no draggable ore. */
export function densestOreClusterOf(
  state: AuthorityState,
  centre: TilePoint,
  radiusTiles: number,
  asker: OreDragAsker,
): OreCluster | null {
  const ground = oreDragGroundOf(state, asker)
  if (ground === null) return null
  return densestOreClusterOn(ground, centre, radiusTiles)
}

/** The ground of the planet the state is on, as `asker`'s drag reads it; null between planets. */
export function oreDragGroundOf(state: AuthorityState, asker: OreDragAsker): OreDragGround | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  return { draggableOreAt: (tile) => draggableOreOf(state, params, asker, tile) }
}

/** `densestOreClusterOf` on any ground: each tile of the capped disc read once. */
export function densestOreClusterOn(
  ground: OreDragGround,
  centre: TilePoint,
  radiusTiles: number,
): OreCluster | null {
  const draggable = draggableOreOfDisc(ground, centre, cappedRadiusOf(radiusTiles))
  const candidates = [...draggable.values()].map((ore) => candidateOf(draggable, ore))
  const best = candidates.reduce<ClusterCandidate | null>(denserOf, null)
  return best === null ? null : { tile: best.tile, score: best.score }
}

/** Hunting this player and telegraphing its lunge (#9's wind-up). */
function isWindingUpOn(enemy: Enemy, playerId: string): boolean {
  return enemy.ownerId === playerId && enemy.phase === 'windup'
}

function sightingOf(pose: VehiclePose, enemy: Enemy): Sighting {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  return { enemy, distanceSq: dx * dx + dy * dy }
}

function compareNearestFirst(a: Sighting, b: Sighting): number {
  if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
  return a.enemy.id < b.enemy.id ? -1 : 1
}

function cappedRadiusOf(radiusTiles: number): number {
  return Math.max(0, Math.min(Math.floor(radiusTiles), ECONOMY.itemHookCaps.reachCellsMax))
}

/** The disc's draggable ore by tile key, in disc order. */
function draggableOreOfDisc(
  ground: OreDragGround,
  centre: TilePoint,
  radiusTiles: number,
): Map<string, DiscOre> {
  const draggable = new Map<string, DiscOre>()
  for (const tile of tilesWithin(centre, radiusTiles)) {
    const ore = ground.draggableOreAt(tile)
    if (ore !== null) draggable.set(keyOf(tile), { ...ore, tile })
  }
  return draggable
}

function candidateOf(draggable: ReadonlyMap<string, DiscOre>, ore: DiscOre): ClusterCandidate {
  return { tile: ore.tile, score: blockScoreOf(draggable, ore.tile), saleValue: ore.saleValue }
}

/** Draggable cells in the 3x3 block round `tile`; a cell outside the disc was never read. */
function blockScoreOf(draggable: ReadonlyMap<string, unknown>, tile: TilePoint): number {
  let score = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (draggable.has(keyOf({ tx: tile.tx + dx, ty: tile.ty + dy }))) score += 1
    }
  }
  return score
}

/** The higher score, then the higher sale value, then the lower `(ty, tx)`. */
function denserOf(best: ClusterCandidate | null, next: ClusterCandidate): ClusterCandidate {
  if (best === null) return next
  if (next.score !== best.score) return next.score > best.score ? next : best
  const bySale = cmp(next.saleValue, best.saleValue)
  if (bySale !== 0) return bySale > 0 ? next : best
  return isRowMajorBefore(next.tile, best.tile) ? next : best
}

function isRowMajorBefore(a: TilePoint, b: TilePoint): boolean {
  return a.ty !== b.ty ? a.ty < b.ty : a.tx < b.tx
}

function draggableOreOf(
  state: AuthorityState,
  params: PlanetParams,
  asker: OreDragAsker,
  tile: TilePoint,
): DraggableOre | null {
  const cell = cellAt(state.world, params, tile)
  if (!isLooseOreCell(state, params, tile, cell)) return null
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const { playerId, tool } = asker
  if (isHeldByGate({ state, playerId, tile, cell, ore, blast: null, tool })) return null
  return { saleValue: oreSalePrice(saleTierOf(ore)) }
}

/** An ore cell with ground left in it and no casing round it. */
function isLooseOreCell(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): boolean {
  if (kindOfCell(cell) !== CELL_KIND.ore) return false
  return cellDensitySum(state.world, params, tile) > 0 && !isCellLined(state.world, params, tile)
}

/** A gate verdict other than `cut` holds the cell against every tool (#142). */
function isHeldByGate(query: GateQuery): boolean {
  const verdict = gateVerdictOf(query)
  return verdict !== null && verdict.outcome !== 'cut'
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
