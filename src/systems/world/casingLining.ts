/**
 * One ring of casing lining (decision #41 Placement rule "Where"), integer arithmetic only: the
 * samples whose position in mm lies in the annulus `clearR <= d < clearR + width` round a centre,
 * chosen against the ground as it stood before the ring, so the lining is one sample thick:
 *
 * 1. An **air** sample with a **solid** 8-neighbour becomes solid casing of `grade`: walls only,
 *    never a ring in mid-air. Air and solid are as the contour sees them (below or at least iso
 *    128): the drill's soft rim leaves wall samples partly carved, never exactly 0.
 * 2. A **casing** sample of a lower grade is raised to `grade` (relining), density unchanged.
 *
 * Never refused: a grade too low for the band still lines (#41). The dock pad is never lined, as it
 * is never carved. A player grade above 15 lines at 15, the most a sample holds.
 */
import { MAX_SAMPLE_CASING_GRADE } from './chunkDelta'
import {
  casingGradeOf,
  closeSession,
  densityOf,
  isCarvable,
  lineSample,
  openSession,
  relineSample,
  type EditSession,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import { ISO_DENSITY, MM_PER_SAMPLE } from './sampleGrid'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'
import type { WorldState } from './worldState'

/** A ring of lining round `(xMm, yMm)`: inner radius `clearMm`, `widthMm` thick. */
export interface CasingRing {
  xMm: number
  yMm: number
  clearMm: number
  widthMm: number
}

export interface Lining extends GroundEdit {
  /** Air samples that became casing. */
  placed: number
  /** Casing samples raised to the ring's grade. */
  relined: number
}

type RingStep = 'line' | 'reline' | 'skip'

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
  return {
    ...closeSession(session),
    placed: steps.filter(({ step }) => step === 'line').length,
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
  if (!isCarvable(session, sample)) return 'skip'
  const current = casingGradeOf(session, sample)
  if (current > 0) return current < grade ? 'reline' : 'skip'
  return isAirTouchingGround(session, sample) ? 'line' : 'skip'
}

function isAirTouchingGround(session: EditSession, sample: WeightedSample): boolean {
  if (densityOf(session, sample) >= ISO_DENSITY) return false
  return NEIGHBOUR_OFFSETS.some(
    ([dx, dy]) =>
      densityOf(session, { ...sample, sx: sample.sx + dx, sy: sample.sy + dy }) >= ISO_DENSITY,
  )
}

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

function applyRingStep(
  session: EditSession,
  sample: WeightedSample,
  step: RingStep,
  grade: number,
): void {
  if (step === 'line') lineSample(session, sample, grade)
  if (step === 'reline') relineSample(session, sample, grade)
}
