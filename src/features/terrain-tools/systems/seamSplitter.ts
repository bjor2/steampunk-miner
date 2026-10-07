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
 * Mark milestones (#256, an income item's where and how): the Mark 3 second tap splits across the
 * face, a quarter turn from the facing; the Mark 6 hold splits straight along the facing, ignoring
 * the grain. Each opens the same length from the same face.
 */
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { TerrainCellEdit } from '../../../systems/authority/terrain/terrainEdits'
import { ticksPerCell } from '../../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { ACTIVATION_UNIT_CAP, canAfford, draftOpen, OPEN_UNITS, openDraft } from './editDraft'
import { facingStepOf, stepped, turnedStep, type GridStep } from './editGeometry'
import { editSeedOf, tieBreakOf, type EditKey } from './editSeed'
import {
  cellNow,
  fixedBlockOf,
  isAnchored,
  isOpenAir,
  isWorkableGround,
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

/** The second tap's split across the face: two eighths, a quarter turn from the facing. */
const ACROSS_TURN = 2

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
  const grain = splitLineOf(verb, facing, editSeedOf(view.params, key), face)
  const length = sizeOf(terrainItemNamed(SEAM_SPLITTER_ID), key, verb)
  return planOfFissure(splitAlong(view, face, grain, length))
}

/** Along the grain; across the face for a second tap; along the facing for a hold. */
function splitLineOf(verb: ToolVerb, facing: GridStep, seed: number, face: TilePoint): GridStep {
  if (isSecondTap(verb)) return turnedStep(facing, ACROSS_TURN)
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
    if (!isSplittable(view, tile)) break
    draftOpen(draft, tile)
  }
  return draft.cells
}

/** Plain ground off the anchors and casing that the miner's drill could cut. */
function isSplittable(view: GroundView, tile: TilePoint): boolean {
  return isWorkableGround(view, tile) && !isTooHardForDrill(view, tile)
}

function isTooHardForDrill(view: GroundView, tile: TilePoint): boolean {
  const drill = heatThrottledDrill(view.params.planetIndex, vehicleOf(view.state, view.playerId))
  return ticksPerCell(drill, view.params, tile, cellNow(view, tile)) === null
}

function planOfFissure(cells: readonly TerrainCellEdit[]): TerrainPlan {
  if (cells.length > 0) return { kind: 'edit', cells }
  return { kind: 'refused', reason: TERRAIN_REFUSAL.noGrain }
}
