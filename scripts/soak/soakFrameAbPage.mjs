// What the frame A/B (ticket 526) runs inside the game's page: Playwright serialises each function
// and evaluates it there, so each is self-contained and reaches the game only through
// `globalThis.steampunkDebug` and the page's own WebGL.

/** The planet first: the depth below is in basis points of that planet's radius. */
export function enterPlanet(planetIndex) {
  const debug = globalThis.steampunkDebug
  return [debug.setPlanet(planetIndex), debug.freezeEnemies(true)].flatMap(problemsOf)

  function problemsOf(result) {
    return result.ok ? [] : result.problems
  }
}

/**
 * The ore-heavy view, held still: full quality at render scale 1 (so the adaptive scale never
 * hides the cost), the bar's zoom, and the vehicle parked at the band's depth with no enemies.
 */
export function holdOreView(view) {
  const debug = globalThis.steampunkDebug
  return [
    debug.ui.setRenderQuality('high'),
    debug.ui.setRenderScale(1),
    debug.ui.setZoom(view.viewShortAxisMetres),
    debug.teleportToDepth(view.depthBp),
    debug.setEnergy('150'),
    debug.setHull('100'),
  ].flatMap(problemsOf)

  function problemsOf(result) {
    return result.ok ? [] : result.problems
  }
}

/**
 * Counts every shader program linked from now on: a link while the view is held is a recompile.
 * The prototypes are wrapped, so the game's existing context counts too.
 */
export function startCountingProgramLinks() {
  globalThis.frameAbProgramLinks = 0
  for (const context of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    const link = context.prototype.linkProgram
    context.prototype.linkProgram = function countedLinkProgram(program) {
      globalThis.frameAbProgramLinks++
      return link.call(this, program)
    }
  }
}

export function readProgramLinks() {
  return globalThis.frameAbProgramLinks
}

/** The last full second's frame p50 (the game's render stats) and the drawn area in CSS pixels. */
export function readFrameSample() {
  const { stats } = globalThis.steampunkDebug.ui.getRenderStats()
  return {
    frameP50Ms: stats.frameMsP50,
    viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
  }
}

/** The GPU the page draws with, as WebGL names it (SwiftShader on a box with no GPU). */
export function readRendererName() {
  const gl = globalThis.document.createElement('canvas').getContext('webgl2')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return info
    ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
    : (gl?.getParameter(gl.RENDERER) ?? 'none')
}
