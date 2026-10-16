/**
 * The render quality ladder (TD #470 section 2.4, ticket 477): under `auto`, which rung of
 * `renderQuality.ts` the frames have earned. It goes down a rung only once the render scale has
 * nothing left to give (it sits at its floor) and a second still missed, at most every 2 s; it
 * climbs back one rung after a minute of met seconds in a row, the slow re-probe. Driven by whole
 * seconds of frames, so it takes the same time at any frame rate. Presentation only.
 */
import {
  RENDER_QUALITY_REPROBE_SECONDS,
  RENDER_SCALE_SETTLED_STEP_SECONDS,
} from '../../constants/renderQuality'
import { LOWEST_QUALITY_RUNG } from './renderQuality'
import type { FrameVerdict } from './renderScale'

export interface QualityLadder {
  /** 0 draws the preset; each rung below cuts one more thing (`degradedQualityOf`). */
  rung: number
  secondsSinceStep: number
  /** Seconds in a row that met the frame budget. */
  metSeconds: number
}

/** One second of frames as the ladder reads it. */
export interface LadderSecond {
  verdict: FrameVerdict
  isScaleAtFloor: boolean
}

export function createQualityLadder(): QualityLadder {
  return { rung: 0, secondsSinceStep: RENDER_SCALE_SETTLED_STEP_SECONDS, metSeconds: 0 }
}

/** A new choice of quality starts from its preset again. */
export function resetQualityLadder(ladder: QualityLadder): void {
  Object.assign(ladder, createQualityLadder())
}

export function stepQualityLadder(ladder: QualityLadder, second: LadderSecond): void {
  countSecond(ladder, second.verdict)
  if (canDescend(ladder, second)) moveRung(ladder, 1)
  else if (canClimb(ladder)) moveRung(ladder, -1)
}

function countSecond(ladder: QualityLadder, verdict: FrameVerdict): void {
  ladder.secondsSinceStep++
  ladder.metSeconds = verdict === 'met' ? ladder.metSeconds + 1 : 0
}

function canDescend(ladder: QualityLadder, second: LadderSecond): boolean {
  const isRested = ladder.secondsSinceStep >= RENDER_SCALE_SETTLED_STEP_SECONDS
  const hasRungLeft = ladder.rung < LOWEST_QUALITY_RUNG
  return second.verdict === 'missed' && second.isScaleAtFloor && isRested && hasRungLeft
}

function canClimb(ladder: QualityLadder): boolean {
  return ladder.rung > 0 && ladder.metSeconds >= RENDER_QUALITY_REPROBE_SECONDS
}

function moveRung(ladder: QualityLadder, by: 1 | -1): void {
  ladder.rung += by
  ladder.secondsSinceStep = 0
  ladder.metSeconds = 0
}
