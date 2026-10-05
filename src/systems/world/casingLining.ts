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
 * 2. A solid **casing** sample of a lower grade is raised to `grade` (relining); a grade that
 *    already matches is left alone.
 *
 * Never refused: a grade too low for the band still lines (#41). The dock pad is never lined, as it
 * is never carved. A player grade above 15 lines at 15, the most a sample holds.
 */
import { CASING_LINING_HALF_WIDTH_MM, DRILL_STAMP_RADIUS_MM } from '../../constants/balance'
import { cellSampleIndices } from './cellYield'
import { MAX_SAMPLE_CASING_GRADE } from './chunkDelta'
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
  /** Native rock samples that became lining. */
  placed: number
  /** Those samples, in row order: the wall a first-placed lining charge is priced by (#76). */
  linedSamples: readonly WeightedSample[]
  /** Lining samples raised to the ring's grade. */
  relined: number
}

type RingStep = 'line' | 'reline' | 'skip'

/** The drill's ring round a point of the tunnel axis: `stampR - 0.25 m <= d < stampR + 0.25 m`. */
export function casingRingAround(xMm: number, yMm: number): CasingRing {
  return {
    xMm,
    yMm,
    clearMm: DRILL_STAMP_RADIUS_MM - CASING_LINING_HALF_WIDTH_MM,
    widthMm: 2 * CASING_LINING_HALF_WIDTH_MM,
  }
}

export function lineRing(
  world: WorldState,
  params: PlanetParams,
  ring: CasingRing,
  playerGrade: number,
): Lining {
  const session = openSession(world, params)
  const grade = Math.min(playerGrade, MAX_SAMPLE_CASING_GRADE)
  const steps = ringSamplesOf(ring).map((sample) => ({
    sample,
    step: ringStepOf(session, sample, grade),
  }))
  steps.forEach(({ sample, step }) => applyRingStep(session, sample, step, grade))
  const linedSamples = steps.filter(({ step }) => step === 'line').map(({ sample }) => sample)
  return {
    ...closeSession(session),
    placed: linedSamples.length,
    linedSamples,
    relined: steps.filter(({ step }) => step === 'reline').length,
  }
}

/** The samples of the annulus in row order, as full-weight stamp samples. */
function ringSamplesOf(ring: CasingRing): WeightedSample[] {
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

function ringStepOf(session: EditSession, sample: WeightedSample, grade: number): RingStep {
  if (!isCarvable(session, sample) || densityOf(session, sample) <= ISO_DENSITY) return 'skip'
  const current = casingGradeOf(session, sample)
  if (current > 0) return current < grade ? 'reline' : 'skip'
  return isBesideAir(session, sample) ? 'line' : 'skip'
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
  grade: number,
): void {
  if (step !== 'skip') markSampleCasing(session, sample, grade)
}

/** Whether the cell still holds lining with rock left in it: what the drill would cut as casing. */
export function isCellLined(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const casing = currentCasingOfChunk(world, cx, cy)
  const density = currentDensityOfChunk(world, params, cx, cy)
  return cellSampleIndices(tile).some((index) => casing[index] > 0 && density[index] > 0)
}
