// The frame-cost A/B of the packaged Electron soak (ticket 526): the merge gate the GD set for the
// materials look (#450) and the per-act hero atlas (#451) in the GD ruling on #450
// (issuecomment-6226278574, item 4) on the TD shape (issuecomment-6226270701, "Merge gate"). Pure:
// it judges the rounds soakFrameAb.mjs measured and names their metric ids; no fs, no clock.
//
// The bar is judged on a real GPU only. A SwiftShader run is a dry run of the harness: its numbers
// are never a measurement and never count for or against the bar, so they get their own ids.
import { medianOf, roundMetric } from '../perf/perfMetrics.mjs'

/** The ore-heavy view the bar is judged in: P1 band 5, 20 m zoom, 1280x800 (TD shape item 7). */
export const FRAME_AB_VIEW = {
  planetIndex: 1,
  band: 5,
  // Band 5 starts at 90% of the depth (BAND_START_DEPTH_PERCENT); 9500 bp is its middle above
  // the core (P1: radius 300 tiles, core 7, so 285 tiles down and 15 tiles from the centre).
  depthBp: 9500,
  viewShortAxisMetres: 20,
  width: 1280,
  height: 800,
}

/** p50 at most +0.5 ms look on vs off, and no shader recompile while the view is held. */
export const FRAME_AB_BAR = { maxP50DeltaMs: 0.5, maxShaderRecompiles: 0 }

/** Real-GPU ids chart apart from the dry runs, so a SwiftShader number never joins the series. */
const ID_PREFIX = { gpu: 'frameAbElectron', swiftShader: 'frameAbElectronSwiftShader' }

export const NOT_GPU_NUMBERS = 'SwiftShader: not GPU numbers, never used for or against the bar'
export const PHONE_READING_MISSING = 'phone reading: not available yet'

/** Whether the WebGL renderer string names Chromium's software rasteriser. */
export function isSwiftShaderRenderer(renderer) {
  return /swiftshader/i.test(renderer ?? '')
}

/**
 * One build's rounds -> its p50 (the median of each round's median of per-second p50s), the
 * shader programs linked while the view was held, and the viewports the rounds drew at.
 */
export function summariseSide(rounds) {
  return {
    rounds: rounds.length,
    frameP50Ms: roundMetric(medianOf(rounds.map((round) => medianOf(round.frameP50sMs)))),
    shaderRecompiles: rounds.reduce((sum, round) => sum + round.programsLinked, 0),
    viewports: [
      ...new Set(rounds.map((round) => `${round.viewport.width}x${round.viewport.height}`)),
    ],
  }
}

/**
 * Both builds' rounds -> the A/B summary: each side, the p50 delta (on minus off), whether it is a
 * real-GPU measurement, every way it misses the bar, and the verdict (`PASS`, `FAIL` or
 * `NOT A MEASUREMENT` for a SwiftShader dry run).
 */
export function summariseFrameAb({ off, on, renderer }) {
  const sides = { off: summariseSide(off), on: summariseSide(on) }
  const deltaMs = roundMetric(sides.on.frameP50Ms - sides.off.frameP50Ms)
  const isGpuMeasurement = !isSwiftShaderRenderer(renderer)
  const failures = listBarFailures(sides, deltaMs)
  return {
    view: FRAME_AB_VIEW,
    bar: FRAME_AB_BAR,
    renderer,
    isGpuMeasurement,
    ...sides,
    frameP50DeltaMs: deltaMs,
    failures,
    verdict: verdictOf(isGpuMeasurement, failures),
  }
}

function verdictOf(isGpuMeasurement, failures) {
  if (!isGpuMeasurement) return 'NOT A MEASUREMENT'
  return failures.length === 0 ? 'PASS' : 'FAIL'
}

function listBarFailures(sides, deltaMs) {
  return [...listDeltaOverBar(deltaMs), ...listRecompiles(sides.on), ...listOffViewports(sides)]
}

function listDeltaOverBar(deltaMs) {
  if (deltaMs <= FRAME_AB_BAR.maxP50DeltaMs) return []
  return [
    `p50 rose ${deltaMs} ms with the look on (bar: at most +${FRAME_AB_BAR.maxP50DeltaMs} ms)`,
  ]
}

function listRecompiles(on) {
  if (on.shaderRecompiles <= FRAME_AB_BAR.maxShaderRecompiles) return []
  return [`${on.shaderRecompiles} shader program(s) linked while the look-on view was held`]
}

function listOffViewports(sides) {
  const wanted = `${FRAME_AB_VIEW.width}x${FRAME_AB_VIEW.height}`
  const drawn = [...new Set([...sides.off.viewports, ...sides.on.viewports])]
  if (drawn.every((viewport) => viewport === wanted)) return []
  return [`drew at ${drawn.join(', ')}; the bar is judged at ${wanted}`]
}

/** The summary -> its history.ndjson ids, under the dry-run prefix when SwiftShader drew it. */
export function metricsOfFrameAb(summary) {
  const prefix = summary.isGpuMeasurement ? ID_PREFIX.gpu : ID_PREFIX.swiftShader
  return {
    [`${prefix}.frameP50OffMs`]: summary.off.frameP50Ms,
    [`${prefix}.frameP50OnMs`]: summary.on.frameP50Ms,
    [`${prefix}.frameP50DeltaMs`]: summary.frameP50DeltaMs,
    [`${prefix}.shaderRecompiles`]: summary.on.shaderRecompiles,
  }
}

/** The lines the harness prints: view, both sides, the delta against the bar, the verdict, phone. */
export function formatFrameAbReport(summary, phoneReading) {
  const { view, bar } = summary
  return [
    `frame A/B, P${view.planetIndex} band ${view.band}, ${view.viewShortAxisMetres} m zoom, ${view.width}x${view.height}`,
    `renderer: ${summary.renderer}`,
    ...(summary.isGpuMeasurement ? [] : [NOT_GPU_NUMBERS]),
    `off: p50 ${summary.off.frameP50Ms} ms over ${summary.off.rounds} round(s), ${summary.off.shaderRecompiles} program(s) linked`,
    `on:  p50 ${summary.on.frameP50Ms} ms over ${summary.on.rounds} round(s), ${summary.on.shaderRecompiles} program(s) linked`,
    `delta: ${signed(summary.frameP50DeltaMs)} ms (bar: at most +${bar.maxP50DeltaMs} ms, no shader recompile)`,
    ...summary.failures.map((failure) => `  ${failure}`),
    `verdict: ${summary.verdict}`,
    phoneReading ?? PHONE_READING_MISSING,
  ]
}

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`
}
