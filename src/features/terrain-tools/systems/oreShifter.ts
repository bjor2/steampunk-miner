/**
 * The magnetic ore-shifter (#162 section 1 row, 4.2): it **drags** a few common ore cells within
 * its radius toward the hull, nearest first. Each nodule travels a seeded grid path toward the
 * miner through solid ground and comes to rest where the next step would leave the ground, reach a
 * fixed cell or come within 1 m of a vehicle; its ore and the ground it stops on trade places. The
 * edit lands whole on the activation tick and collects nothing: you still drill the ore.
 *
 * Gated and core cells are fixed and block paths. A use whose only ore in reach is fixed is
 * blocked by the nearest such cell and costs nothing; one with no ore in reach is refused. A combo
 * may choose which loose nodules go first through the `dragTarget` item hook (`dragHooks.ts`,
 * ticket 326), never how many.
 */
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { GateBlock } from '../../power-up-core'
import {
  ACTIVATION_UNIT_CAP,
  canAfford,
  draftMove,
  MOVE_UNITS,
  openDraft,
  type EditDraft,
} from './editDraft'
import { oreInDragOrder } from './dragHooks'
import { stepsToward, tilesNearestFirst } from './editGeometry'
import { editSeedOf, type EditKey } from './editSeed'
import { canHoldOre, fixedBlockOf, isLooseOre, materialNow, type GroundView } from './groundView'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { balanceOf, type TerrainItem } from './terrainItems'
import { TERRAIN_REFUSAL } from './terrainEvents'
import type { TerrainPlan } from './terrainOutcome'

export const ORE_SHIFTER_ID = 'power.ore_shifter'

/** Where the drag pulls to and how far it reaches. */
interface DragPull {
  hull: TilePoint
  seed: number
}

export function planOreDrag(view: GroundView, key: EditKey, pose: VehiclePose): TerrainPlan {
  const item = terrainItemNamed(ORE_SHIFTER_ID)
  const pull = { hull: tileOfPose(pose), seed: editSeedOf(view.params, key) }
  const count = magnitudeAt(item, key.mark)
  const tiles = tilesNearestFirst(pull.hull, reachOf(item), pull.seed)
  const draft = openDraft(view, ACTIVATION_UNIT_CAP)
  dragOre(draft, pull, oreInDragOrder(view, key, count, tiles), count)
  return planOfDrag(draft, tiles)
}

function reachOf(item: TerrainItem): number {
  return balanceOf(item).reachTiles ?? balanceOf(item).magnitude
}

/** Drags up to `count` of the nodules, in the order given, while the cap can pay a move. */
function dragOre(draft: EditDraft, pull: DragPull, nodules: readonly TilePoint[], count: number) {
  let dragged = 0
  for (const tile of nodules) {
    if (dragged === count || !canAfford(draft, MOVE_UNITS)) return
    if (dragOne(draft, pull, tile)) dragged += 1
  }
}

/** Moves the nodule at `tile` as far toward the hull as the ground lets it; false if it stays. */
function dragOne(draft: EditDraft, pull: DragPull, tile: TilePoint): boolean {
  if (!isLooseOre(draft.view, tile)) return false
  const rest = restingTileOf(draft.view, tile, pull)
  if (rest === null) return false
  draftMove(draft, tile, rest)
  return true
}

/**
 * The last tile of the nodule's path that can hold it, or null when it cannot take one step. Each
 * step goes along the longer leg toward the hull, or the other leg where that one is blocked.
 */
function restingTileOf(view: GroundView, from: TilePoint, pull: DragPull): TilePoint | null {
  const ore = materialNow(view, from)
  let at = from
  let next = nextStepOf(view, at, pull, ore)
  while (next !== null) {
    at = next
    next = nextStepOf(view, at, pull, ore)
  }
  return at === from ? null : at
}

function nextStepOf(view: GroundView, at: TilePoint, pull: DragPull, ore: number) {
  return stepsToward(at, pull.hull, pull.seed).find((step) => canHoldOre(view, step, ore)) ?? null
}

/** The edit; with nothing dragged, the nearest fixed cell in reach blocks it, if there is one. */
function planOfDrag(draft: EditDraft, tilesInReach: readonly TilePoint[]): TerrainPlan {
  if (draft.cells.length > 0) return { kind: 'edit', cells: draft.cells }
  const block = nearestFixedBlockOf(draft.view, tilesInReach)
  if (block !== null) return { kind: 'blocked', block }
  return { kind: 'refused', reason: TERRAIN_REFUSAL.nothingToDrag }
}

function nearestFixedBlockOf(view: GroundView, tiles: readonly TilePoint[]): GateBlock | null {
  for (const tile of tiles) {
    const block = fixedBlockOf(view, tile)
    if (block !== null) return block
  }
  return null
}
