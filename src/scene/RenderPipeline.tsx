/**
 * Draws each frame through the post pipeline and fits the frames to the GPU (#38 "4K strategy",
 * ticket 477): takes over R3F's render (a positive `useFrame` priority), probes the renderer once
 * for what it can draw (`gpuCapabilities.ts`), draws only the frames the render quality's rate
 * cap leaves, counts what each cost from `renderer.info`, and once per second of drawn frames lets
 * the pure rules move the canvas's pixel ratio between its floor (#173) and the quality's cap, and
 * then the quality ladder (`renderAdaptation.ts`). The HTML UI is outside the canvas, so it stays
 * native at every scale. Its `renderer.info` also answers `ui.getRendererMemory()` (#119).
 * While the canvas has lost its WebGL context it draws nothing and counts no calls (ticket 478).
 * Presentation only: it never writes the authority or submits, and the fixed-step driver ticks
 * the simulation on every display frame whether this one draws or not.
 */
import { useFrame, useThree, type RootState } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  LONG_FRAME_MS,
  POST_PASSES,
  POST_PASSES_WITHOUT_BLOOM,
  RENDER_FRAME_PRIORITY,
} from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import { recordGpuCapabilities } from '../store/perfLog'
import {
  countFramesOver,
  frameMsAt,
  hasFullSecond,
  type FrameWindow,
} from '../systems/render/frameWindow'
import { isGameDrawable, type GpuCapabilities } from '../systems/render/gpuTier'
import {
  drawnRenderScaleOf,
  refloorRenderScale,
  type OutputShortAxis,
  type RenderScale,
} from '../systems/render/renderScale'
import { readGpuCapabilities } from './gpuCapabilities'
import type { PostPipeline } from './postPipeline'
import {
  adaptToDrawnFrames,
  addDrawnFrame,
  createRenderAdaptation,
  isFrameToDraw,
  type RenderAdaptation,
} from './renderAdaptation'
import { createPostDrawing, drawThroughContextLoss } from './renderContextLoss'
import { renderPresence } from './renderPresence'
import { renderPointerPresence, renderQualityPresence } from './renderQualityPresence'

export function RenderPipeline() {
  const gl = useThree((state) => state.gl)
  const readRoot = useThree((state) => state.get)
  const gpu = useMemo(() => readGpuCapabilities(gl), [gl])
  const shortAxis = useMemo(() => ({ cssPixels: 0, devicePixels: 0 }), [])
  const adaptation = useMemo(
    () =>
      createRenderAdaptation(
        gpu,
        renderPointerPresence.isCoarsePointer,
        readOutputShortAxis(readRoot(), shortAxis),
      ),
    [gpu, readRoot, shortAxis],
  )
  const drawing = useMemo(() => createPostDrawing(adaptation.sceneTarget), [adaptation])
  useEffect(() => announceGpu(gpu), [gpu])
  useEffect(() => drawThroughContextLoss(gl, drawing), [gl, drawing])
  useFrame((state, delta) => {
    if (drawing.pipeline === null) return recordNothingDrawn()
    drawAdaptedFrame(state, drawing.pipeline, adaptation, shortAxis, delta)
  }, RENDER_FRAME_PRIORITY)
  return null
}

/** Draws only the frames the quality's rate cap leaves; a skipped frame still ticks the sim. */
function drawAdaptedFrame(
  state: RootState,
  pipeline: PostPipeline,
  adaptation: RenderAdaptation,
  shortAxis: OutputShortAxis,
  delta: number,
): void {
  if (!isFrameToDraw(adaptation, useGameStore.getState().prefs.renderQuality, delta)) return
  drawFrame(state, pipeline)
  recordFrameCost(state)
  adaptToFrame(state, adaptation, readOutputShortAxis(state, shortAxis))
}

/** Logged once per renderer; a GPU under the hard minimum shows its card over the stage. */
function announceGpu(gpu: GpuCapabilities): void {
  const { terrainProgram, sceneTarget } = renderQualityPresence
  recordGpuCapabilities({ ...gpu, terrainProgram, sceneTarget })
  if (!isGameDrawable(gpu)) useGameStore.getState().showUnsupportedDeviceCard()
}

function drawFrame(state: RootState, pipeline: PostPipeline): void {
  state.gl.info.reset()
  if (renderQualityPresence.isBloomDrawn) pipeline.render(state.gl, state.scene, state.camera)
  else pipeline.renderWithoutBloom(state.gl, state.scene, state.camera)
}

/**
 * The canvas's shorter side in CSS pixels and at the display's own pixel ratio (capped by the
 * canvas's `dpr` range), written into `out` so the frame loop allocates nothing.
 */
function readOutputShortAxis(state: RootState, out: OutputShortAxis): OutputShortAxis {
  out.cssPixels = Math.min(state.size.width, state.size.height)
  out.devicePixels = out.cssPixels * state.viewport.initialDpr
  return out
}

/** A lost context draws nothing; the last frame's counts would read as a live picture. */
function recordNothingDrawn(): void {
  renderPresence.drawCalls = 0
  renderPresence.triangles = 0
}

function recordFrameCost(state: RootState): void {
  const { render } = state.gl.info
  renderPresence.drawCalls = render.calls
  renderPresence.triangles = render.triangles
  renderPresence.postPasses = renderQualityPresence.isBloomDrawn
    ? POST_PASSES
    : POST_PASSES_WITHOUT_BLOOM
  renderPresence.internalWidth = state.gl.domElement.width
  renderPresence.internalHeight = state.gl.domElement.height
}

function adaptToFrame(
  state: RootState,
  adaptation: RenderAdaptation,
  shortAxis: OutputShortAxis,
): void {
  addDrawnFrame(adaptation)
  refloorRenderScale(adaptation.scale, shortAxis)
  recordSecondOfFrames(adaptation.frames)
  adaptToDrawnFrames(adaptation, useGameStore.getState().renderScalePin)
  applyRenderScale(state, adaptation.scale)
}

/** Read before the scale rule starts the next window. */
function recordSecondOfFrames(frames: FrameWindow): void {
  if (!hasFullSecond(frames)) return
  renderPresence.frameMsP50 = frameMsAt(frames, 0.5)
  renderPresence.frameMsP95 = frameMsAt(frames, 0.95)
  renderPresence.frameMsP99 = frameMsAt(frames, 0.99)
  renderPresence.longFrames = countFramesOver(frames, LONG_FRAME_MS)
}

/** Changes the canvas's pixel ratio only when the drawn scale moved onto another level. */
function applyRenderScale(state: RootState, scale: RenderScale): void {
  renderPresence.renderScale = scale.scale
  renderPresence.renderScaleFloor = scale.floor
  renderPresence.isRenderScaleSettled = scale.isSettled
  renderPresence.isRenderScalePinned = scale.isPinned
  const dpr = state.viewport.initialDpr * drawnRenderScaleOf(scale)
  if (Math.abs(state.viewport.dpr - dpr) > 1e-6) state.setDpr(dpr)
}
