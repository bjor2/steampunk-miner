/**
 * The seam splitter (#162 section 1 row, 4.3): a hydraulic wedge set at the rock face the miner
 * faces opens a narrow fissure of common ground along the rock's seeded grain, straight ahead or
 * a seeded eighth of a turn to either side, for a short length. It is a line, never an area: it
 * opens plain ground only, collects nothing and drops no ore, exposing the ore beside it.
 *
 * The face is the first solid cell ahead of the miner past the 1 m anchors. The fissure stops at
 * the first cell it may not open: gated, core, ore, casing, too hard for the drill, open air, or
 * within 1 m of a vehicle. A face that is a gated or core cell blocks the use at no cost; a face
 * the wedge cannot split (ore, casing, rock too hard) refuses it at no cost.
 *
 * Mark milestones (#256, an income item's where and how): the Mark 3 second tap splits sideways,
 * toward the side the miner steers toward (Content's where-fix on #276); the Mark 6 hold splits
 * straight ahead of the drill, ignoring the grain. Each opens the same length from the same face.
 */
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import { sideVectorOf } from '../../../systems/vehicle/facedSide'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { ACTIVATION_UNIT_CAP, canAfford, draftOpen, OPEN_UNITS, openDraft } from './editDraft'
import { facingStepOf, stepNearest, stepped, turnedStep, type GridStep } from './editGeometry'
import { editSeedOf, tieBreakOf, type EditKey } from './editSeed'
import {
  fixedBlockOf,
  isAnchored,
  isDrillableGround,
  isOpenAir,
  type GroundView,
} from './groundView'
import { terrainItemNamed } from './itemMagnitude'
import { TERRAIN_REFUSAL } from './terrainEvents'
import type { TerrainPlan } from './terrainOutcome'
import { isHold, isSecondTap, PLAIN_VERB, sizeOf, type ToolVerb } from './toolVerb'

export const SEAM_SPLITTER_ID = 'consumable.seam_splitter'

/** How far ahead of the miner's centre the wedge looks for a face, in tiles. */
const FACE_SEARCH_TILES = 4

/** The grain runs straight ahead, or one eighth of a turn to either side. */
const GRAIN_TURNS: readonly number[] = [0, 1, -1]

export function planSeamSplit(
  view: GroundView,
  key: EditKey,
  pose: VehiclePose,
  verb: ToolVerb = PLAIN_VERB,
): TerrainPlan {
  const facing = facingStepOf(pose)
  const face = faceTileOf(view, tileOfPose(pose), facing)
  if (face === null) return { kind: 'refused', reason: TERRAIN_REFUSAL.noGrain }
  const block = fixedBlockOf(view, face)
  if (block !== null) return { kind: 'blocked', block }
  const grain = splitLineOf(verb, pose, editSeedOf(view.params, key), face)
  const length = sizeOf(terrainItemNamed(SEAM_SPLITTER_ID), key, verb)
  return planOfFissure(splitAlong(view, face, grain, length))
}

/** Along the grain; toward the faced side for a second tap; along the facing for a hold. */
function splitLineOf(verb: ToolVerb, pose: VehiclePose, seed: number, face: TilePoint): GridStep {
  const facing = facingStepOf(pose)
  if (isSecondTap(verb)) return stepNearest(sideVectorOf(pose, verb.facedSide))
  if (isHold(verb)) return facing
  return grainOf(facing, seed, face)
}

/** The first solid cell along the facing past the anchors, or null with none near. */
function faceTileOf(view: GroundView, centre: TilePoint, facing: GridStep): TilePoint | null {
  for (let reach = 1; reach <= FACE_SEARCH_TILES; reach += 1) {
    const tile = stepped(centre, facing, reach)
    if (!isAnchored(view, tile) && !isOpenAir(view, tile)) return tile
  }
  return null
}

function grainOf(facing: GridStep, seed: number, face: TilePoint): GridStep {
  return turnedStep(facing, GRAIN_TURNS[tieBreakOf(seed, face) % GRAIN_TURNS.length])
}

/** Opens `length` cells from the face along the grain, stopping at the first it may not open. */
function splitAlong(view: GroundView, face: TilePoint, grain: GridStep, length: number) {
  const draft = openDraft(view, ACTIVATION_UNIT_CAP)
  for (let step = 0; step < length && canAfford(draft, OPEN_UNITS); step += 1) {
    const tile = stepped(face, grain, step)
    if (!isDrillableGround(view, tile)) break
    draftOpen(draft, tile)
  }
  return draft.cells
}

function planOfFissure(cells: readonly TerrainCellEdit[]): TerrainPlan {
  if (cells.length > 0) return { kind: 'edit', cells, banked: null }
  return { kind: 'refused', reason: TERRAIN_REFUSAL.noGrain }
}
