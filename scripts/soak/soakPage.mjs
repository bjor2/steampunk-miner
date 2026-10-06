// What the memory soak runs inside the game's page (#99): Playwright serialises each function and
// evaluates it there, so each is self-contained and reaches the game only through
// `globalThis.steampunkDebug` (`?debug`) and the browser's own `performance.memory`.

/** Both memory reads refuse until the scene has mounted its renderer and physics world. */
export function isGameMemoryReadable() {
  const debug = globalThis.steampunkDebug
  return debug !== undefined && debug.getPhysicsStats().ok && debug.ui.getRendererMemory().ok
}

/** One reading of the game through its debug API; a refused read is listed, its counts null. */
export function readGameMemory() {
  const debug = globalThis.steampunkDebug
  const renderer = debug.ui.getRendererMemory()
  const physics = debug.getPhysicsStats()
  const stats = debug.ui.getRenderStats().stats
  const state = debug.snapshot().snapshot.state
  const pose = Object.values(state.players)[0].vehicle.pose
  return {
    usedJSHeapSize: performance.memory?.usedJSHeapSize ?? null,
    totalJSHeapSize: performance.memory?.totalJSHeapSize ?? null,
    geometries: renderer.ok ? renderer.geometries : null,
    textures: renderer.ok ? renderer.textures : null,
    programs: renderer.ok ? renderer.programs : null,
    rapierBodies: physics.ok ? physics.rigidBodies : null,
    rapierColliders: physics.ok ? physics.colliders : null,
    wasmBytes: physics.ok ? physics.wasmBytes : null,
    refusals: [renderer, physics].flatMap((read) => (read.ok ? [] : read.problems)),
    drawCalls: stats.drawCalls,
    groundBlocks: stats.groundBlocks,
    drawnChunks: stats.drawnChunks,
    groundColliders: stats.groundColliders,
    gameFrameP50Ms: stats.frameMsP50,
    gameFrameP95Ms: stats.frameMsP95,
    tick: state.tick,
    poseX: pose.x,
    poseY: pose.y,
    // Legitimate game-state growth (drilled chunks), to tell it apart from a leak.
    worldStateJsonBytes: JSON.stringify(state.world).length,
    runLogBytes: (globalThis.steampunkRunLog?.() ?? '').length,
  }
}

/** Refills energy and hull on the dock; a vehicle already on the pad refuses the teleport. */
export function refillOnDock() {
  const debug = globalThis.steampunkDebug
  const docked = debug.teleportToDock()
  const isOnPad = docked.ok || docked.problems.join().includes('already docked')
  return [debug.setEnergy('150'), debug.setHull('100')]
    .concat(isOnPad ? [] : [docked])
    .flatMap((result) => (result.ok ? [] : result.problems))
}
