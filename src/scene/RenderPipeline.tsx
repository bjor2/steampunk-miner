/**
 * Draws each frame through the post pipeline and adapts the render scale (#38 "4K strategy"):
 * takes over R3F's render (a positive `useFrame` priority), counts what the frame cost from
 * `renderer.info`, and once per second of frames lets the pure render-scale rule move the canvas's
 * pixel ratio between the 1080p floor and a native render. The HTML UI is outside the canvas, so
 * it stays native at every scale. Its `renderer.info` also answers `ui.getRendererMemory()` (#119).
 * Presentation only: it never writes the authority or submits.
 */
import { useFrame, useThree, type RootState } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { POST_PASSES } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import {
  addFrame,
  createFrameWindow,
  frameMsAt,
  hasFullSecond,
  type FrameWindow,
} from '../systems/render/frameWindow'
import {
  adaptRenderScale,
  createRenderScale,
  pinRenderScale,
  refloorRenderScale,
  type RenderScale,
} from '../systems/render/renderScale'
import { createPostPipeline } from './postPipeline'
import { renderPresence } from './renderPresence'
import { watchRendererInfo } from './rendererMemory'

/** After the scene's own frame work, so the frame is drawn last. */
const RENDER_PRIORITY = 1

export function RenderPipeline() {
  const gl = useThree((state) => state.gl)
  const readRoot = useThree((state) => state.get)
  const pipeline = useMemo(createPostPipeline, [])
  const frames = useMemo(createFrameWindow, [])
  const scale = useMemo(() => createRenderScale(outputShortAxisOf(readRoot())), [readRoot])
  useEffect(() => {
    // Counted over the whole frame, scene and post passes, then reset by hand each frame.
    gl.info.autoReset = false
    const unwatchInfo = watchRendererInfo(gl.info)
    return () => {
      unwatchInfo()
      gl.info.autoReset = true
      pipeline.dispose()
    }
  }, [gl, pipeline])
  useFrame((state, delta) => {
    state.gl.info.reset()
    pipeline.render(state.gl, state.scene, state.camera)
    recordFrameCost(state)
    adaptToFrame(state, scale, frames, delta)
  }, RENDER_PRIORITY)
  return null
}

/** The output's shorter side in device pixels: the canvas at the display's own pixel ratio. */
function outputShortAxisOf(state: RootState): number {
  return Math.min(state.size.width, state.size.height) * state.viewport.initialDpr
}

function recordFrameCost(state: RootState): void {
  const { render } = state.gl.info
  renderPresence.drawCalls = render.calls
  renderPresence.triangles = render.triangles
  renderPresence.postPasses = POST_PASSES
  renderPresence.internalWidth = state.gl.domElement.width
  renderPresence.internalHeight = state.gl.domElement.height
}

function adaptToFrame(
  state: RootState,
  scale: RenderScale,
  frames: FrameWindow,
  delta: number,
): void {
  addFrame(frames, delta)
  refloorRenderScale(scale, outputShortAxisOf(state))
  pinRenderScale(scale, useGameStore.getState().renderScalePin)
  recordSecondOfFrames(frames)
  adaptRenderScale(scale, frames)
  applyRenderScale(state, scale)
}

/** Read before the scale rule starts the next window. */
function recordSecondOfFrames(frames: FrameWindow): void {
  if (!hasFullSecond(frames)) return
  renderPresence.frameMsP50 = frameMsAt(frames, 0.5)
  renderPresence.frameMsP95 = frameMsAt(frames, 0.95)
}

/** Changes the canvas's pixel ratio only when the scale moved, at most once a second. */
function applyRenderScale(state: RootState, scale: RenderScale): void {
  renderPresence.renderScale = scale.scale
  renderPresence.isRenderScaleSettled = scale.isSettled
  renderPresence.isRenderScalePinned = scale.isPinned
  const dpr = state.viewport.initialDpr * scale.scale
  if (Math.abs(state.viewport.dpr - dpr) > 1e-6) state.setDpr(dpr)
}
