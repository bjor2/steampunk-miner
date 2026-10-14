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
 *
 * With the Ore Lure twist held the pull goes toward the plate left on the tunnel wall instead of
 * the hull (`planOreDragTo`, `oreLure.ts`, ticket 329).
 *
 * Mark milestones (#256, an income item's where and how): the Mark 3 second tap reverses the pull,
 * pushing the same count of nodules away from the hull to the rim of its reach; the Mark 6 hold
 * drags the same count only from the side the miner steers toward (`facedSideOf`, the TD lock on
 * #276: the side cutters' side).
 */
import { sideVectorOf } from '../../../systems/vehicle/facedSide'
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
import {
  distanceSqOf,
  stepNearest,
  stepsAwayFrom,
  stepsToward,
  tilesNearestFirst,
  type GridStep,
} from './editGeometry'
import { editSeedOf, type EditKey } from './editSeed'
import { canHoldOre, fixedBlockOf, isLooseOre, materialNow, type GroundView } from './groundView'
import { terrainItemNamed } from './itemMagnitude'
import { balanceOf } from './terrainItems'
import { TERRAIN_REFUSAL } from './terrainEvents'
import type { TerrainPlan } from './terrainOutcome'
import { isHold, isSecondTap, PLAIN_VERB, sizeOf, type ToolVerb } from './toolVerb'

export const ORE_SHIFTER_ID = 'power.ore_shifter'

/**
 * Where the drag pulls to and how far it reaches: toward the hull (or the Ore Lure's plate), or
 * away from the hull (the second tap's push); from all round the hull, or only the side the miner
 * steers toward (the hold's aim).
 */
interface DragPull {
  hull: TilePoint
  /** Where a pull drags to: the hull's tile, or the Ore Lure's plate (`oreLure.ts`). */
  target: TilePoint
  seed: number
  reach: number
  isPush: boolean
  aim: GridStep | null
}

export function planOreDrag(
  view: GroundView,
  key: EditKey,
  pose: VehiclePose,
  verb: ToolVerb = PLAIN_VERB,
): TerrainPlan {
  return planOreDragTo(view, key, pose, verb, tileOfPose(pose))
}

/**
 * The same drag, the nodules in reach of the hull pulled toward `target` instead: where the Ore
 * Lure's plate sits (ticket 329). The count, the cap, the swaps and the fixed cells are the same.
 */
export function planOreDragTo(
  view: GroundView,
  key: EditKey,
  pose: VehiclePose,
  verb: ToolVerb,
  target: TilePoint,
): TerrainPlan {
  const item = terrainItemNamed(ORE_SHIFTER_ID)
  const pull = dragPullOf(view, key, pose, verb, target)
  const count = sizeOf(item, key, verb)
  const tiles = tilesInPull(pull)
  const draft = openDraft(view, ACTIVATION_UNIT_CAP)
  dragOre(draft, pull, oreInDragOrder(view, key, count, tiles), count)
  return planOfDrag(draft, tiles)
}

function dragPullOf(
  view: GroundView,
  key: EditKey,
  pose: VehiclePose,
  verb: ToolVerb,
  target: TilePoint,
): DragPull {
  return {
    hull: tileOfPose(pose),
    target,
    seed: editSeedOf(view.params, key),
    reach: shifterReachTiles(),
    isPush: isSecondTap(verb),
    aim: isHold(verb) ? stepNearest(sideVectorOf(pose, verb.facedSide)) : null,
  }
}

/** How far round the hull the shifter finds its nodules, in whole tiles. */
export function shifterReachTiles(): number {
  const balance = balanceOf(terrainItemNamed(ORE_SHIFTER_ID))
  return balance.reachTiles ?? balance.magnitude
}

/** Drags up to `count` of the nodules, in the order given, while the cap can pay a move. */
function dragOre(draft: EditDraft, pull: DragPull, nodules: readonly TilePoint[], count: number) {
  let dragged = 0
  for (const tile of nodules) {
    if (dragged === count || !canAfford(draft, MOVE_UNITS)) return
    if (dragOne(draft, pull, tile)) dragged += 1
  }
}

/** The tiles in reach, nearest first; with an aim, only those on the side it points to. */
function tilesInPull(pull: DragPull): TilePoint[] {
  const tiles = tilesNearestFirst(pull.hull, pull.reach, pull.seed)
  const { aim } = pull
  return aim === null ? tiles : tiles.filter((tile) => isAhead(pull.hull, aim, tile))
}

function isAhead(hull: TilePoint, aim: GridStep, tile: TilePoint): boolean {
  return (tile.tx - hull.tx) * aim.x + (tile.ty - hull.ty) * aim.y > 0
}

/** Moves the nodule at `tile` as far along the pull as the ground lets it; false if it stays. */
function dragOne(draft: EditDraft, pull: DragPull, tile: TilePoint): boolean {
  if (!isLooseOre(draft.view, tile)) return false
  const rest = restingTileOf(draft.view, tile, pull)
  if (rest === null) return false
  draftMove(draft, tile, rest)
  return true
}

/**
 * The last tile of the nodule's path that can hold it, or null when it cannot take one step. Each
 * step goes along the longer leg toward the pull's target (or away from the hull), or the other
 * leg where that one is blocked; a push stops at the rim of the reach.
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
  return stepsOf(at, pull).find((step) => canHoldOre(view, step, ore)) ?? null
}

function stepsOf(at: TilePoint, pull: DragPull): TilePoint[] {
  if (!pull.isPush) return stepsToward(at, pull.target, pull.seed)
  const withinReach = pull.reach * pull.reach
  return stepsAwayFrom(at, pull.hull, pull.seed).filter(
    (step) => distanceSqOf(step, pull.hull) <= withinReach,
  )
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
