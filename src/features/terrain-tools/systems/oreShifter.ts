/**
 * The magnetic ore-shifter (#162 section 1 row, 4.2): it **drags** a few common ore cells within
 * its radius toward the hull, nearest first. Each nodule travels a seeded grid path toward the
 * miner through solid ground and comes to rest where the next step would leave the ground, reach a
 * fixed cell or come within 1 m of a vehicle; its ore and the ground it stops on trade places. The
 * edit lands whole on the activation tick and collects nothing: you still drill the ore.
 *
 * Gated and core cells are fixed and block paths. A use whose only ore in reach is fixed is
 * blocked by the nearest such cell and costs nothing; one with no ore in reach is refused.
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
import { tilesNearestFirst, stepToward } from './editGeometry'
import { editSeedOf, type EditKey } from './editSeed'
import { canHoldOre, fixedBlockOf, isLooseOre, materialNow, type GroundView } from './groundView'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { balanceOf } from './terrainItems'
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
  const reach = balanceOf(item).reachTiles ?? balanceOf(item).magnitude
  const draft = openDraft(view, ACTIVATION_UNIT_CAP)
  const firstBlock = dragNearestOre(draft, pull, reach, magnitudeAt(item, key.mark))
  return planOfDrag(draft, firstBlock)
}

/** Drags up to `count` nodules, nearest first; the nearest fixed cell met on the way, if any. */
function dragNearestOre(
  draft: EditDraft,
  pull: DragPull,
  reach: number,
  count: number,
): GateBlock | null {
  let firstBlock: GateBlock | null = null
  let dragged = 0
  for (const tile of tilesNearestFirst(pull.hull, reach, pull.seed)) {
    if (dragged === count || !canAfford(draft, MOVE_UNITS)) break
    firstBlock ??= fixedBlockOf(draft.view, tile)
    if (dragOne(draft, pull, tile)) dragged += 1
  }
  return firstBlock
}

/** Moves the nodule at `tile` as far toward the hull as the ground lets it; false if it stays. */
function dragOne(draft: EditDraft, pull: DragPull, tile: TilePoint): boolean {
  if (!isLooseOre(draft.view, tile)) return false
  const rest = restingTileOf(draft.view, tile, pull)
  if (rest === null) return false
  draftMove(draft, tile, rest)
  return true
}

/** The last tile of the nodule's path that can hold it, or null when it cannot take one step. */
function restingTileOf(view: GroundView, from: TilePoint, pull: DragPull): TilePoint | null {
  const ore = materialNow(view, from)
  let at = from
  let next = stepToward(at, pull.hull, pull.seed)
  while (canHoldOre(view, next, ore)) {
    at = next
    next = stepToward(at, pull.hull, pull.seed)
  }
  return at === from ? null : at
}

function planOfDrag(draft: EditDraft, firstBlock: GateBlock | null): TerrainPlan {
  if (draft.cells.length > 0) return { kind: 'edit', cells: draft.cells }
  if (firstBlock !== null) return { kind: 'blocked', block: firstBlock }
  return { kind: 'refused', reason: TERRAIN_REFUSAL.nothingToDrag }
}
