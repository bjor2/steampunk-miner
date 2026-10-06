// The memory soak's summary.json (#99): one flat object per run with the numbers the perf history
// charts (scripts/perf/perfMetrics.mjs reads these field names as the soak.* metric ids, or
// soakElectron.* for the packaged build, #102) and what a reader checks first: the target, cycles, heap at the first and last boundary, the counts there, the gate.
// Pure: it reads a soak.json object and returns the summary.

import { listSoakGateFailures, measureRetainedHeapGrowth, SOAK_GATE } from './soakGate.mjs'

const MIB = 1048576
const DECIMALS = 1000

/** A soak.json run -> its summary.json. Heap and WASM in MiB (the soak logs MiB as "MB"). */
export function summariseSoak(run) {
  const failures = listSoakGateFailures(run.boundaries, run.pageErrors)
  return {
    // Runs from before the Electron target (#102) soaked the preview build in Chromium.
    target: run.target ?? 'browser',
    gate: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    minutes: run.minutes,
    cycles: run.boundaries.length,
    samples: run.samples.length,
    pageErrorCount: run.pageErrors.length,
    consoleErrorCount: run.consoleErrorCount,
    refusalCount: run.refusals.length,
    ...summariseHeap(run),
    ...summariseCounts(run.boundaries),
    peakWasmMB: roundTo(peakOf(allSamplesOf(run), 'wasmBytes') / MIB),
    runLogTextMBperMin: roundTo(slopeOf(run.samples, minutesOf, (s) => s.runLogBytes / MIB)),
    frameP50median: roundTo(medianOf(run.samples.map((sample) => sample.gameFrameP50Ms))),
    frameP95median: roundTo(medianOf(run.samples.map((sample) => sample.gameFrameP95Ms))),
  }
}

/** Least-squares slopes, so one noisy boundary does not set the rate (noise is about +-1.5 MB). */
function summariseHeap(run) {
  const heapMB = (sample) => sample.usedJSHeapSize / MIB
  const settled = run.boundaries.slice(SOAK_GATE.warmupCycles)
  return {
    heapFirstBoundaryMB: roundTo(heapMB(run.boundaries[0])),
    heapLastBoundaryMB: roundTo(heapMB(run.boundaries.at(-1))),
    peakUsedJSHeapMB: roundTo(peakOf(allSamplesOf(run), 'usedJSHeapSize') / MIB),
    heapSlopeMBperCycle: roundTo(slopeOf(run.boundaries, (b) => b.cycle, heapMB)),
    heapSlopeAfterCycle4MBperMin: roundTo(slopeOf(settled, minutesOf, heapMB)),
    heapGateGrowthMB: roundTo(megabytesOf(measureRetainedHeapGrowth(settled))),
  }
}

function summariseCounts(boundaries) {
  const first = boundaries[0]
  const last = boundaries.at(-1)
  return {
    geometriesFirstLast: [first.geometries, last.geometries],
    texturesFirstLast: [first.textures, last.textures],
    collidersFirstLast: [first.rapierColliders, last.rapierColliders],
    bodiesFirstLast: [first.rapierBodies, last.rapierBodies],
    wasmBytesFirstLast: [first.wasmBytes, last.wasmBytes],
  }
}

function megabytesOf(bytes) {
  return bytes === null ? null : bytes / MIB
}

function allSamplesOf(run) {
  return [...run.samples, ...run.boundaries]
}

function minutesOf(sample) {
  return sample.t / 60
}

function peakOf(samples, field) {
  return Math.max(...samples.map((sample) => sample[field]))
}

/** Ordinary least squares of y over x; null with fewer than two distinct x. */
function slopeOf(samples, xOf, yOf) {
  const xs = samples.map(xOf)
  const ys = samples.map(yOf)
  const meanX = meanOf(xs)
  const meanY = meanOf(ys)
  const spread = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
  if (!(spread > 0)) return null
  const covariance = xs.reduce((sum, x, at) => sum + (x - meanX) * (ys[at] - meanY), 0)
  return covariance / spread
}

function meanOf(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function medianOf(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function roundTo(value) {
  return value === null ? null : Math.round(value * DECIMALS) / DECIMALS
}
