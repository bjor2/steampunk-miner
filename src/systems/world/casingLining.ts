/**
 * One ring of casing lining (decision #41 Placement rule "Where", amended twice on #56, 5 Oct, and
 * held round the 1.2 m bore's wall by the GD lock on #662), integer arithmetic only: the samples
 * whose position in mm lies in the annulus `clearR <= d < clearR + width` round a centre on the
 * tunnel axis, or for a drill trail's ring the band that far from the hole its stretch of axis
 * cut (`casingRingAlong`, `casingRingBand.ts`), chosen against the ground as it stood before the
 * ring. Lining marks the **rock side** of the bore's wall, so the bore never narrows:
 *
 * 1. A **native solid** sample (density > 128, the contour iso, and casing 0) with an **air**
 *    4-neighbour (density <= 128) takes the casing `grade`. Its material and density stay as they
 *    were, so the contour, collision and the cell's ore are the same lined or not; only the drill
 *    time and `casing_drilled` change. Rock with no air beside it is never lined, so lining never
 *    spreads deeper than one sample.
 * 2. A solid **casing** sample of the ring's own lining type and a lower grade is raised to
 *    `grade` (relining); a grade that already matches is left alone. Breached lining (#111) holds
 *    at grade 0 and keeps its type, so in its own type it is relined like any lower grade: free,
 *    as it lines no new rock (M3).
 * 3. A solid casing sample of **another lining type** (#113) is relaid in the ring's type at the
 *    higher of the two grades, so a type change never weakens the wall. It counts as first
 *    placement of the new type: it joins the wall the charge is priced by.
 *
 * The ring also lines a **floor box** (GD lock on #662, Q3, Systems' row): the samples under its
 * centre toward the planet's, across the wheels' width and down to where a level tunnel's floor
 * may lie (`floorBoxDepthMm`), so the floor the stamp's floor band cuts (`floorBand.ts`), up to
 * 0.93 m under the axis where the annulus ends at 0.85 m, stays lined. In a shaft that box is the
 * shaft's own air and lines nothing new.
 *
 * Never refused: a grade too low for the band still lines (#41). The dock pad is never lined, as it
 * is never carved. A player grade above 15 lines at 15, the most a sample holds.
 */
import { BODY_HALF_SIZE_MM, CASING_LINING_WIDTH_MM } from '../../constants/balance'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { drillStampLiftMm, drillStampRadiusMm } from '../vehicle/drillBore'
import { cellSampleIndices } from './cellYield'
import { planetUpAt, type PlanetUp } from './planetUp'
import {
  casingValueOf,
  effectiveCasingGrade,
  isLined,
  liningTypeIndexOfValue,
  MAX_SAMPLE_CASING_GRADE,
  STANDARD_CASING_TYPE_INDEX,
} from './chunkDelta'
import {
  casingGradeOf,
  closeSession,
  densityOf,
  isCarvable,
  markSampleCasing,
  openSession,
  type EditSession,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import { ISO_DENSITY, MM_PER_SAMPLE, SAMPLES_PER_TILE } from './sampleGrid'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'
import { chunkOfTile, type TilePoint } from './tileGrid'
import { isInRingBand, ringShapeBoxOf, type CasingRing, type MmPoint } from './casingRingBand'
import { currentCasingOfChunk, currentDensityOfChunk, type WorldState } from './worldState'

export { NO_RING_SWEEP, type CasingRing } from './casingRingBand'

export interface Lining extends GroundEdit {
  /** Native rock samples that became lining, and lining of another type relaid in this one. */
  placed: number
  /** Those samples, in row order: the wall a first-placed lining charge is priced by (#76, #113). */
  linedSamples: readonly WeightedSample[]
  /** Lining samples of the ring's own type raised to its grade. */
  relined: number
}

/** The ring's lining: its grade and its type (0 = standard, #113). */
interface RingLining {
  grade: number
  typeIndex: number
}

type RingStep = 'line' | 'retype' | 'reline' | 'skip'

/**
 * The drill's ring round a point of the tunnel axis, read from the live stamp's radius: `stampR -
 * 0.25 m <= d < stampR + 0.25 m`, from the bore wall's full-weight edge (`stampShape.ts`) to the
 * rock just outside it. The TD's release check on #662 found the ring that started at `stampR`
 * left the rock behind a wall sample cut just under the iso unlined (24 samples on L20's down leg);
 * starting a sample inside, as #36's ring did round its own bore, lines it.
 */
export function casingRingAround(xMm: number, yMm: number): CasingRing {
  return {
    xMm,
    yMm,
    clearMm: drillStampRadiusMm() - CASING_LINING_WIDTH_MM,
    widthMm: 2 * CASING_LINING_WIDTH_MM,
  }
}

/**
 * The drill trail's ring for the stretch of axis from `stretchFromMm` to `(xMm, yMm)`, swept by
 * the stamp's offset `sweepMm` in the cut of the tick it fell due (the TD's Q1 and the GD's (e)
 * rulings on #662, `casingRingBand.ts`): the same band as `casingRingAround`, measured from the
 * hole that tick cut, so between two points the band holds the wall's rock at `stampR + 0.25 m`
 * where the circles round them pulled in to 0.81 m (the scallop on the 1.2 m bore), and a wall the
 * slanted stamp stands past the body's line is lined from where it stands. A pose report's ring
 * has no sweep (`NO_RING_SWEEP`). Debug, gnaw and breach rings stay circles.
 */
export function casingRingAlong(
  xMm: number,
  yMm: number,
  stretchFromMm: MmPoint,
  sweepMm: MmPoint,
): CasingRing {
  return { ...casingRingAround(xMm, yMm), stretchFromMm, sweepMm }
}

/** Lines one ring at the player's `grade`, in the lining type `typeIndex` (the standard one by default). */
export function lineRing(
  world: WorldState,
  params: PlanetParams,
  ring: CasingRing,
  grade: number,
  typeIndex: number = STANDARD_CASING_TYPE_INDEX,
): Lining {
  return lineRingSamples(world, params, ringSamplesOf(ring), grade, typeIndex)
}

/**
 * Lines the walls of one opened cell (ticket 377, the bore's lining): the samples just outside its
 * four sides, laid as a ring lays them, so only rock beside the cell's air is lined.
 */
export function lineCellWalls(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  grade: number,
  typeIndex: number,
): Lining {
  return lineRingSamples(world, params, cellWallSamplesOf(tile), grade, typeIndex)
}

/** The samples one step outside each side of a cell, as full-weight stamp samples. */
export function cellWallSamplesOf(tile: TilePoint): WeightedSample[] {
  const first = { sx: tile.tx * SAMPLES_PER_TILE, sy: tile.ty * SAMPLES_PER_TILE }
  const samples: WeightedSample[] = []
  for (let along = 0; along < SAMPLES_PER_TILE; along++) {
    samples.push(
      wallSample(first.sx + along, first.sy - 1),
      wallSample(first.sx - 1, first.sy + along),
      wallSample(first.sx + SAMPLES_PER_TILE, first.sy + along),
      wallSample(first.sx + along, first.sy + SAMPLES_PER_TILE),
    )
  }
  return samples
}

function wallSample(sx: number, sy: number): WeightedSample {
  return { sx, sy, weight: FULL_WEIGHT, floor: 0 }
}

/** Lines the samples as a ring lines its own: a ring the gates trimmed (`casingGates.ts`). */
export function lineRingSamples(
  world: WorldState,
  params: PlanetParams,
  samples: readonly WeightedSample[],
  grade: number,
  typeIndex: number,
): Lining {
  const session = openSession(world, params)
  const ringLining = { grade: Math.min(grade, MAX_SAMPLE_CASING_GRADE), typeIndex }
  const steps = samples.map((sample) => ({
    sample,
    step: ringStepOf(session, sample, ringLining),
  }))
  steps.forEach(({ sample, step }) => applyRingStep(session, sample, step, ringLining))
  const linedSamples = steps.filter(({ step }) => isNewLining(step)).map(({ sample }) => sample)
  return {
    ...closeSession(session),
    placed: linedSamples.length,
    linedSamples,
    relined: steps.filter(({ step }) => step === 'reline').length,
  }
}

/** The samples of the band and its floor box in row order, as full-weight stamp samples. */
export function ringSamplesOf(ring: CasingRing): WeightedSample[] {
  const outer = Math.max(ring.clearMm + ring.widthMm, floorBoxDepthMm() + MM_PER_SAMPLE)
  const box = ringShapeBoxOf(ring, outer)
  const isInRing = ringTestOf(ring)
  const samples: WeightedSample[] = []
  for (let sy = Math.ceil(box.minYMm / MM_PER_SAMPLE); sy * MM_PER_SAMPLE < box.maxYMm; sy++) {
    for (let sx = Math.ceil(box.minXMm / MM_PER_SAMPLE); sx * MM_PER_SAMPLE < box.maxXMm; sx++) {
      if (isInRing(sx, sy)) samples.push({ sx, sy, weight: FULL_WEIGHT, floor: 0 })
    }
  }
  return samples
}

/** Upright, for a ring at the planet's centre itself. */
const UPRIGHT: PlanetUp = { upx: 0, upy: UP_VECTOR_SCALE }

/** Whether a sample is the ring's: in its band, or in its floor box. */
function ringTestOf(ring: CasingRing): (sx: number, sy: number) => boolean {
  const up = planetUpAt(ring.xMm, ring.yMm, UPRIGHT)
  return (sx, sy) =>
    isInRingBand(ring, sx * MM_PER_SAMPLE, sy * MM_PER_SAMPLE) || isInFloorBox(ring, up, sx, sy)
}

/** Under the ring's centre, no deeper than a level floor may lie and within the wheels' half width. */
function isInFloorBox(ring: CasingRing, up: PlanetUp, sx: number, sy: number): boolean {
  const dx = sx * MM_PER_SAMPLE - ring.xMm
  const dy = sy * MM_PER_SAMPLE - ring.yMm
  const depth = -(dx * up.upx + dy * up.upy)
  const across = Math.abs(dx * up.upy - dy * up.upx)
  const isUnder = depth > 0 && depth <= floorBoxDepthMm() * UP_VECTOR_SCALE
  return isUnder && across <= BODY_HALF_SIZE_MM * UP_VECTOR_SCALE
}

/**
 * How far under the axis a level tunnel's floor rock may lie: the stamp's lift, the wheels' line
 * under the body's centre, the floor rounded down to whole samples (up to one more), its first
 * solid sample up to one under the floor's circle (`drillStamp.ts`), and one more where the floor
 * steps up along the planet's curve: the band of the last stamp before the step reaches half the
 * wheels' width past it at the lower floor, and at a pose report every tick that stamp lies nearer
 * the step than at 12-tick reports (#514's casing cadence spec).
 */
function floorBoxDepthMm(): number {
  return drillStampLiftMm() + BODY_HALF_SIZE_MM + 3 * MM_PER_SAMPLE
}

function ringStepOf(session: EditSession, sample: WeightedSample, lining: RingLining): RingStep {
  if (!isCarvable(session, sample) || densityOf(session, sample) <= ISO_DENSITY) return 'skip'
  const current = casingGradeOf(session, sample)
  if (isLined(current)) return liningStepOf(current, lining)
  return isBesideAir(session, sample) ? 'line' : 'skip'
}

/** Lining already there, breached or not: another type is relaid, the same type relined up. */
function liningStepOf(current: number, lining: RingLining): RingStep {
  if (liningTypeIndexOfValue(current) !== lining.typeIndex) return 'retype'
  return effectiveCasingGrade(current) < lining.grade ? 'reline' : 'skip'
}

function isNewLining(step: RingStep): boolean {
  return step === 'line' || step === 'retype'
}

/** A wall sample: one of its 4-neighbours is air (#56 Technical Director, rock-side lining). */
function isBesideAir(session: EditSession, sample: WeightedSample): boolean {
  return NEIGHBOUR_OFFSETS.some(
    ([dx, dy]) =>
      densityOf(session, { ...sample, sx: sample.sx + dx, sy: sample.sy + dy }) <= ISO_DENSITY,
  )
}

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]

function applyRingStep(
  session: EditSession,
  sample: WeightedSample,
  step: RingStep,
  lining: RingLining,
): void {
  if (step === 'skip') return
  markSampleCasing(
    session,
    sample,
    casingValueOf(gradeAfter(session, sample, step, lining), lining.typeIndex),
  )
}

/** A relaid sample keeps the higher grade; every other step lays the ring's grade. */
function gradeAfter(
  session: EditSession,
  sample: WeightedSample,
  step: RingStep,
  lining: RingLining,
): number {
  if (step !== 'retype') return lining.grade
  return Math.max(lining.grade, effectiveCasingGrade(casingGradeOf(session, sample)))
}

/** Whether the cell still holds lining with rock left in it: what the drill would cut as casing. */
export function isCellLined(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const casing = currentCasingOfChunk(world, cx, cy)
  const density = currentDensityOfChunk(world, params, cx, cy)
  return cellSampleIndices(tile).some((index) => isLined(casing[index]) && density[index] > 0)
}
