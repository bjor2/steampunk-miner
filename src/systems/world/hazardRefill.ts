/**
 * A rockfall cell's refill (ticket 848, the `refill` contact effect; ticket 651's "the cut fills
 * again with the pocket's rubble"), integer only:
 *
 * - The cut samples of the cell (density under solid) are counted, and `shareBp` of them, rounded
 *   down, return to density 255, those farthest from the rig that cut it first: the rubble pours in
 *   over the face, not onto the bit.
 * - A rig is never embedded: samples within `COLLAPSE_VEHICLE_CLEARANCE_MM` of any body centre stay
 *   air, as a collapse refill leaves them (#43), so a full share may fill fewer.
 * - Samples keep their material and the cell's `yielded` bit is untouched, so re-cutting the rubble
 *   never pays ore twice and never meets the hazard again. Lining on a refilled sample goes.
 */
import { COLLAPSE_VEHICLE_CLEARANCE_MM } from '../../constants/balance'
import type { BodyCentre } from './collapseRefill'
import {
  casingGradeOf,
  closeSession,
  densityOf,
  editSample,
  markSampleCasing,
  openSession,
  type EditSession,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import { MM_PER_SAMPLE, SAMPLES_PER_TILE, SOLID_DENSITY } from './sampleGrid'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'
import type { TilePoint } from './tileGrid'
import type { WorldState } from './worldState'

const BASIS_POINTS = 10000

export interface CellRefillAsk {
  tile: TilePoint
  shareBp: number
  /** The body centre of the rig whose drill cut the cell, or null with no pose. */
  cutter: BodyCentre | null
  /** Every rig's body centre, none of which a refill may bury. */
  bodies: readonly BodyCentre[]
}

export interface CellRefill extends GroundEdit {
  /** Cut samples returned to solid. */
  filled: number
}

export function refillCutCell(
  world: WorldState,
  params: PlanetParams,
  ask: CellRefillAsk,
): CellRefill {
  const session = openSession(world, params)
  const cut = samplesOfTile(ask.tile).filter((sample) => densityOf(session, sample) < SOLID_DENSITY)
  const due = Math.floor((cut.length * ask.shareBp) / BASIS_POINTS)
  const filled = farthestFirst(fillableOf(cut, ask.bodies), ask.cutter).slice(0, due)
  filled.forEach((sample) => fillSample(session, sample))
  return { ...closeSession(session), filled: filled.length }
}

function samplesOfTile(tile: TilePoint): WeightedSample[] {
  return Array.from({ length: SAMPLES_PER_TILE * SAMPLES_PER_TILE }, (_, at) => ({
    sx: tile.tx * SAMPLES_PER_TILE + (at % SAMPLES_PER_TILE),
    sy: tile.ty * SAMPLES_PER_TILE + Math.floor(at / SAMPLES_PER_TILE),
    weight: FULL_WEIGHT,
    floor: 0,
  }))
}

function fillableOf(
  samples: readonly WeightedSample[],
  bodies: readonly BodyCentre[],
): WeightedSample[] {
  return samples.filter((sample) => !bodies.some((body) => isWithinClearance(sample, body)))
}

/** Farthest from the cutter first, then in row order; row order alone with no cutter. */
function farthestFirst(
  samples: readonly WeightedSample[],
  cutter: BodyCentre | null,
): WeightedSample[] {
  if (cutter === null) return [...samples]
  return [...samples].sort(
    (a, b) => distanceSqOf(b, cutter) - distanceSqOf(a, cutter) || a.sy - b.sy || a.sx - b.sx,
  )
}

function fillSample(session: EditSession, sample: WeightedSample): void {
  editSample(session, sample, () => SOLID_DENSITY)
  if (casingGradeOf(session, sample) > 0) markSampleCasing(session, sample, 0)
}

function isWithinClearance(sample: WeightedSample, body: BodyCentre): boolean {
  return distanceSqOf(sample, body) <= COLLAPSE_VEHICLE_CLEARANCE_MM * COLLAPSE_VEHICLE_CLEARANCE_MM
}

function distanceSqOf(sample: WeightedSample, body: BodyCentre): number {
  const dx = sample.sx * MM_PER_SAMPLE - body.xMm
  const dy = sample.sy * MM_PER_SAMPLE - body.yMm
  return dx * dx + dy * dy
}
