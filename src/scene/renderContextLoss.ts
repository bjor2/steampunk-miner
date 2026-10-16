/**
 * The canvas's WebGL context, lost and restored (#470 P1-7, ticket 478): the ONE listener for the
 * game canvas's `webglcontextlost` and `webglcontextrestored`. iOS Safari reclaims a context under
 * memory pressure; until the browser gives it back the post pipeline is dropped, nothing is drawn
 * and the live step holds, with Reconnecting on the stage. On restore three has already rebuilt its
 * own state (its listener runs first, added when the renderer was made) and re-uploads geometry,
 * textures and programs as they are next drawn; this re-creates the post targets, follows three's
 * new `info` and lets the step run. Presentation only: the sim just waits.
 */
import type { WebGLRenderer } from 'three'
import { useGameStore } from '../store/gameStore'
import { createPostPipeline, type PostPipeline } from './postPipeline'
import { watchRendererInfo } from './rendererMemory'

/** What `RenderPipeline` draws through: null while the context is lost or nothing is mounted. */
export interface PostDrawing {
  pipeline: PostPipeline | null
  unwatchInfo: () => void
}

export function createPostDrawing(): PostDrawing {
  return { pipeline: null, unwatchInfo: () => {} }
}

/** Starts drawing on the renderer and follows its context; the returned call stops both. */
export function drawThroughContextLoss(gl: WebGLRenderer, drawing: PostDrawing): () => void {
  startDrawing(gl, drawing)
  const unfollow = followContext(gl, drawing)
  return () => {
    unfollow()
    stopDrawing(gl, drawing)
  }
}

function followContext(gl: WebGLRenderer, drawing: PostDrawing): () => void {
  const canvas = gl.domElement
  const loseContext = (event: Event) => holdForLostContext(event, gl, drawing)
  const restoreContext = () => resumeOnRestoredContext(gl, drawing)
  canvas.addEventListener('webglcontextlost', loseContext)
  canvas.addEventListener('webglcontextrestored', restoreContext)
  return () => {
    canvas.removeEventListener('webglcontextlost', loseContext)
    canvas.removeEventListener('webglcontextrestored', restoreContext)
  }
}

function holdForLostContext(event: Event, gl: WebGLRenderer, drawing: PostDrawing): void {
  // Without it the browser never offers the context back.
  event.preventDefault()
  stopDrawing(gl, drawing)
  useGameStore.getState().holdLiveStepWhileContextLost()
}

function resumeOnRestoredContext(gl: WebGLRenderer, drawing: PostDrawing): void {
  startDrawing(gl, drawing)
  useGameStore.getState().resumeLiveStepOnRestoredContext()
}

/**
 * Counted over the whole frame, scene and post passes, then reset by hand each frame. Three makes
 * a new `info` when it restores the context, so the memory counts follow the one it draws with.
 */
function startDrawing(gl: WebGLRenderer, drawing: PostDrawing): void {
  gl.info.autoReset = false
  drawing.unwatchInfo = watchRendererInfo(gl.info)
  drawing.pipeline = createPostPipeline()
}

/** Disposed while the old `info` still counts the targets, so the new one never goes below 0. */
function stopDrawing(gl: WebGLRenderer, drawing: PostDrawing): void {
  drawing.unwatchInfo()
  drawing.pipeline?.dispose()
  drawing.pipeline = null
  gl.info.autoReset = true
}
