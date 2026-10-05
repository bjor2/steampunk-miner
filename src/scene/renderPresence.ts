/**
 * What the last frame cost and how it was drawn (#38 acceptance 1-3: draw calls, triangles,
 * visible ground blocks, the render scale and frame times; #4: the terrain's work and the live
 * ground colliders): written by `RenderPipeline`, `PlanetTerrain` and the vehicle loop, read by
 * the debug API's render stats and the perf log. A mutable
 * registry, because it changes every frame and never goes through React or the store.
 */
export const renderPresence = {
  /** Draw calls of the whole frame: the scene plus the post passes. */
  drawCalls: 0,
  triangles: 0,
  postPasses: 0,
  groundBlocks: 0,
  drawnChunks: 0,
  /** Milliseconds the terrain's sync took this frame. */
  terrainMs: 0,
  groundColliders: 0,
  renderScale: 1,
  isRenderScaleSettled: false,
  isRenderScalePinned: false,
  /** The drawing buffer the scene renders into, in device pixels. */
  internalWidth: 0,
  internalHeight: 0,
  /** Over the last full second of frames. */
  frameMsP50: 0,
  frameMsP95: 0,
}
