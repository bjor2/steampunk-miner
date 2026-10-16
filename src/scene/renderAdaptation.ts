/**
 * How the render pipeline fits the frames to the GPU (#38 "4K strategy", ticket 477): the
 * player's quality choice and the probed device give the preset; under `auto` the ladder lowers it
 * while frames drop; the render rate cap decides which display frames draw; and each second of
 * drawn frames steps the render scale and then the ladder. The ONLY writer of
 * `renderQualityPresence` and `gpuPresence`. Presentation only: none of it reaches the authority or the digest, and
 * the fixed-step driver ticks the simulation on every display frame whether it draws or not.
 */
import { FRAME_BUDGET_MS } from '../constants/scene'
import { addFrame, createFrameWindow, type FrameWindow } from '../systems/render/frameWindow'
import {
  sceneTargetOf,
  terrainProgramOf,
  type GpuCapabilities,
  type SceneTarget,
} from '../systems/render/gpuTier'
import {
  createQualityLadder,
  resetQualityLadder,
  stepQualityLadder,
  type QualityLadder,
} from '../systems/render/qualityLadder'
import {
  chosenPresetOf,
  degradedQualityOf,
  isBloomDrawn,
  type RenderDevice,
  type RenderQualityChoice,
} from '../systems/render/renderQuality'
import {
  closeDrawInterval,
  createRenderRate,
  frameBudgetMsOf,
  isFrameDue,
  type RenderRate,
} from '../systems/render/renderRate'
import {
  adaptRenderScale,
  capRenderScale,
  createRenderScale,
  isRenderScaleAtFloor,
  pinRenderScale,
  type FrameVerdict,
  type OutputShortAxis,
  type RenderScale,
} from '../systems/render/renderScale'
import { gpuPresence, renderQualityPresence } from './renderQualityPresence'

export interface RenderAdaptation {
  device: RenderDevice
  sceneTarget: SceneTarget
  scale: RenderScale
  ladder: QualityLadder
  /** The drawn frames' intervals, one second at a time. */
  frames: FrameWindow
  rate: RenderRate
  /** The choice and rung the presence was last written for, so most frames recompute nothing. */
  shownChoice: RenderQualityChoice | null
  shownRung: number
}

export function createRenderAdaptation(
  gpu: GpuCapabilities,
  isCoarsePointer: boolean,
  shortAxis: OutputShortAxis,
): RenderAdaptation {
  const device = { terrainProgram: terrainProgramOf(gpu), isCoarsePointer }
  const sceneTarget = sceneTargetOf(gpu)
  gpuPresence.gpu = gpu
  Object.assign(renderQualityPresence, { terrainProgram: device.terrainProgram, sceneTarget })
  return {
    device,
    sceneTarget,
    scale: createRenderScale(shortAxis),
    ladder: createQualityLadder(),
    frames: createFrameWindow(),
    rate: createRenderRate(),
    shownChoice: null,
    shownRung: 0,
  }
}

/** Each display frame: follows the player's choice, and answers whether this frame draws. */
export function isFrameToDraw(
  adaptation: RenderAdaptation,
  choice: RenderQualityChoice,
  delta: number,
): boolean {
  followQualityChoice(adaptation, choice)
  return isFrameDue(adaptation.rate, renderQualityPresence.renderFpsCap, delta)
}

/** After a drawn frame: the interval since the last drawn one joins the window. */
export function addDrawnFrame(adaptation: RenderAdaptation): void {
  addFrame(adaptation.frames, closeDrawInterval(adaptation.rate))
}

/**
 * Once the window spans a second of drawn frames, it steps the render scale, then the ladder.
 * `pin` is the debug API's held scale, or null.
 */
export function adaptToDrawnFrames(adaptation: RenderAdaptation, pin: number | null): void {
  const { scale, frames } = adaptation
  pinRenderScale(scale, pin)
  capRenderScale(scale, renderQualityPresence.renderScaleCap)
  const budgetMs = frameBudgetMsOf(renderQualityPresence.renderFpsCap, FRAME_BUDGET_MS)
  stepLadderOnSecond(adaptation, adaptRenderScale(scale, frames, budgetMs))
}

/** A new choice starts the ladder over; the presence is rewritten only when something moved. */
function followQualityChoice(adaptation: RenderAdaptation, choice: RenderQualityChoice): void {
  if (choice !== adaptation.shownChoice) resetQualityLadder(adaptation.ladder)
  const isShown =
    choice === adaptation.shownChoice && adaptation.ladder.rung === adaptation.shownRung
  if (!isShown) showQuality(adaptation, choice)
}

function showQuality(adaptation: RenderAdaptation, choice: RenderQualityChoice): void {
  const preset = chosenPresetOf(choice, adaptation.device)
  const rung = choice === 'auto' ? adaptation.ladder.rung : 0
  const quality = degradedQualityOf(preset, rung)
  const isBloomOn = isBloomDrawn(quality, adaptation.sceneTarget)
  Object.assign(renderQualityPresence, quality, { choice, preset, rung, isBloomDrawn: isBloomOn })
  adaptation.shownChoice = choice
  adaptation.shownRung = adaptation.ladder.rung
}

/** Only `auto` moves on the ladder, and never while the debug API holds the render scale. */
function stepLadderOnSecond(adaptation: RenderAdaptation, verdict: FrameVerdict | null): void {
  const { scale, ladder } = adaptation
  if (verdict === null || adaptation.shownChoice !== 'auto' || scale.isPinned) return
  stepQualityLadder(ladder, { verdict, isScaleAtFloor: isRenderScaleAtFloor(scale) })
}
