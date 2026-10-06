/**
 * One ring of casing lining (decision #41 Placement rule "Where", amended twice on #56, 5 Oct),
 * integer arithmetic only: the samples whose position in mm lies in the annulus `clearR <= d <
 * clearR + width` round a centre on the tunnel axis, chosen against the ground as it stood before
 * the ring. Lining marks the **rock side** of the bore's wall, so the bore never narrows:
 *
 * 1. A **native solid** sample (density > 128, the contour iso, and casing 0) with an **air**
 *    4-neighbour (density <= 128) takes the casing `grade`. Its material and density stay as they
 *    were, so the contour, collision and the cell's ore are the same lined or not; only the drill
 *    time and `casing_drilled` change. Rock with no air beside it is never lined, so lining never
 *    spreads deeper than one sample.
 * 2. A solid **casing** sample of the ring's own lining type and a lower grade is raised to
 *    `grade` (relining); a grade that already matches is left alone. Breached lining (#111) holds
 *    at grade 0 and no type, so it is relined like any lower grade: free, as it lines no new rock.
 * 3. A solid casing sample of **another lining type** (#113) is relaid in the ring's type at the
 *    higher of the two grades, so a type change never weakens the wall. It counts as first
 *    placement of the new type: it joins the wall the charge is priced by.
 *
 * Never refused: a grade too low for the band still lines (#41). The dock pad is never lined, as it
 * is never carved. A player grade above 15 lines at 15, the most a sample holds.
 */
import { CASING_LINING_HALF_WIDTH_MM, DRILL_STAMP_RADIUS_MM } from '../../constants/balance'
import { cellSampleIndices } from './cellYield'
import {
  casingTypeIndexOf,
  casingValueOf,
  effectiveCasingGrade,
  isLined,
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
import { ISO_DENSITY, MM_PER_SAMPLE } from './sampleGrid'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'
import { chunkOfTile, type TilePoint } from './tileGrid'
import { currentCasingOfChunk, currentDensityOfChunk, type WorldState } from './worldState'

/** A ring of lining round `(xMm, yMm)`: inner radius `clearMm`, `widthMm` thick. */
export interface CasingRing {
  xMm: number
  yMm: number
  clearMm: number
  widthMm: number
}

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

/** The drill's ring round a point of the tunnel axis: `stampR - 0.25 m <= d < stampR + 0.25 m`. */
export function casingRingAround(xMm: number, yMm: number): CasingRing {
  return {
    xMm,
    yMm,
    clearMm: DRILL_STAMP_RADIUS_MM - CASING_LINING_HALF_WIDTH_MM,
    widthMm: 2 * CASING_LINING_HALF_WIDTH_MM,
  }
}

/** Lines one ring at the player's `grade`, in the lining type `typeIndex` (the standard one by default). */
export function lineRing(
  world: WorldState,
  params: PlanetParams,
  ring: CasingRing,
  grade: number,
  typeIndex: number = STANDARD_CASING_TYPE_INDEX,
): Lining {
  const session = openSession(world, params)
  const ringLining = { grade: Math.min(grade, MAX_SAMPLE_CASING_GRADE), typeIndex }
  const steps = ringSamplesOf(ring).map((sample) => ({
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

/** The samples of the annulus in row order, as full-weight stamp samples. */
export function ringSamplesOf(ring: CasingRing): WeightedSample[] {
  const outer = ring.clearMm + ring.widthMm
  const samples: WeightedSample[] = []
  for (
    let sy = Math.ceil((ring.yMm - outer) / MM_PER_SAMPLE);
    sy * MM_PER_SAMPLE < ring.yMm + outer;
    sy++
  ) {
    for (
      let sx = Math.ceil((ring.xMm - outer) / MM_PER_SAMPLE);
      sx * MM_PER_SAMPLE < ring.xMm + outer;
      sx++
    ) {
      if (isInAnnulus(ring, sx, sy)) samples.push({ sx, sy, weight: FULL_WEIGHT, floor: 0 })
    }
  }
  return samples
}

function isInAnnulus(ring: CasingRing, sx: number, sy: number): boolean {
  const dx = sx * MM_PER_SAMPLE - ring.xMm
  const dy = sy * MM_PER_SAMPLE - ring.yMm
  const distanceSq = dx * dx + dy * dy
  const outer = ring.clearMm + ring.widthMm
  return distanceSq >= ring.clearMm * ring.clearMm && distanceSq < outer * outer
}

function ringStepOf(session: EditSession, sample: WeightedSample, lining: RingLining): RingStep {
  if (!isCarvable(session, sample) || densityOf(session, sample) <= ISO_DENSITY) return 'skip'
  const current = casingGradeOf(session, sample)
  if (isLined(current)) return liningStepOf(current, lining)
  return isBesideAir(session, sample) ? 'line' : 'skip'
}

/** Lining already there: another type is relaid, the same type (or a breach) only relined up. */
function liningStepOf(current: number, lining: RingLining): RingStep {
  const typeIndex = casingTypeIndexOf(current)
  if (typeIndex !== null && typeIndex !== lining.typeIndex) return 'retype'
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
