/**
 * The pressure pocket lance (#162 section 1 row, 4.2): a steam lance blows a small pocket in the
 * ground ahead of the miner, giving room to turn or fight. The pocket is a disc of the item's
 * radius whose near rim meets the 1 m anchors, so no cell next to a vehicle opens and no vehicle
 * moves. Plain ground opens, nearest the pocket's centre first; an ore cell is pushed outward to
 * the first plain ground past the rim and kept, then its old tile opens. Gated, core and lined
 * cells stay where they are, and the cap stops the pocket at 32 density cells' worth of units.
 *
 * A pocket centred on a gated or core cell is blocked at no cost; one with nothing to open is
 * refused at no cost.
 */
import { MM_PER_METRE, VEHICLE_COLLIDER_SIZE } from '../../../constants/physics'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  ACTIVATION_UNIT_CAP,
  canAfford,
  draftMove,
  draftOpen,
  MOVE_UNITS,
  OPEN_UNITS,
  openDraft,
  type EditDraft,
} from './editDraft'
import { distanceSqOf, stepAway, tileAheadOf, tilesNearestFirst } from './editGeometry'
import { editSeedOf, type EditKey } from './editSeed'
import {
  canHoldOre,
  fixedBlockOf,
  isLooseOre,
  isWorkableGround,
  materialNow,
  type GroundView,
} from './groundView'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { TERRAIN_REFUSAL } from './terrainEvents'
import type { TerrainPlan } from './terrainOutcome'

export const PRESSURE_POCKET_ID = 'power.pressure_pocket'

/** The hull's half width plus the 1 m anchor reach: where the pocket's near rim sits. */
const RIM_OFFSET_MM = (VEHICLE_COLLIDER_SIZE * MM_PER_METRE) / 2 + MM_PER_METRE

/** How many tiles past the rim a pushed ore cell looks for ground to rest on. */
const PUSH_REACH_TILES = 3

/** The pocket being blown: its centre, radius and seed. */
interface Pocket {
  centre: TilePoint
  radius: number
  seed: number
}

export function planPressurePocket(view: GroundView, key: EditKey, pose: VehiclePose): TerrainPlan {
  const radius = magnitudeAt(terrainItemNamed(PRESSURE_POCKET_ID), key.mark)
  const centre = tileAheadOf(pose, RIM_OFFSET_MM + radius * MM_PER_METRE)
  const block = fixedBlockOf(view, centre)
  if (block !== null) return { kind: 'blocked', block }
  const draft = openDraft(view, ACTIVATION_UNIT_CAP)
  blowPocket(draft, { centre, radius, seed: editSeedOf(view.params, key) })
  if (draft.cells.length > 0) return { kind: 'edit', cells: draft.cells }
  return { kind: 'refused', reason: TERRAIN_REFUSAL.nothingToOpen }
}

/** Every tile of the disc, nearest the centre first, while the cap pays. */
function blowPocket(draft: EditDraft, pocket: Pocket): void {
  for (const tile of tilesNearestFirst(pocket.centre, pocket.radius, pocket.seed)) {
    if (!canAfford(draft, OPEN_UNITS)) return
    openPocketTile(draft, pocket, tile)
  }
}

function openPocketTile(draft: EditDraft, pocket: Pocket, tile: TilePoint): void {
  if (isWorkableGround(draft.view, tile)) draftOpen(draft, tile)
  else if (isLooseOre(draft.view, tile)) pushOreOutward(draft, pocket, tile)
}

/** The ore moves to ground past the rim and its tile opens; with no ground near, it stays. */
function pushOreOutward(draft: EditDraft, pocket: Pocket, tile: TilePoint): void {
  if (!canAfford(draft, MOVE_UNITS + OPEN_UNITS)) return
  const rest = restPastRimOf(draft.view, pocket, tile)
  if (rest === null) return
  draftMove(draft, tile, rest)
  draftOpen(draft, tile)
}

function restPastRimOf(view: GroundView, pocket: Pocket, from: TilePoint): TilePoint | null {
  const ore = materialNow(view, from)
  const lastStep = pocket.radius + PUSH_REACH_TILES
  let at = from
  for (let step = 0; step < lastStep; step += 1) {
    at = stepAway(at, pocket.centre, pocket.seed)
    if (isPastRim(pocket, at) && canHoldOre(view, at, ore)) return at
  }
  return null
}

function isPastRim(pocket: Pocket, tile: TilePoint): boolean {
  return distanceSqOf(tile, pocket.centre) > pocket.radius * pocket.radius
}
