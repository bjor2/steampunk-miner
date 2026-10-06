// The memory soak's leak gate (#99; perf report /workspace/perf/memory/out/report.md section 6),
// ported unchanged from the perf pass's soakMemory.mjs. Pure: it reads the cycle boundaries of a
// soak.json and the page errors, and lists every failure; an empty list is a PASS.
//
// A leak is a trend across cycle boundaries (sampled on the dock after GC), never a single step:
// - the first 4 cycles are warm-up (JIT code and first-use effects such as the drill's particle
//   buffers add a one-time step: 31 -> 34 geometries at cycle 4 in the first soak);
// - heap compares the median of the last 3 boundaries with the first 3, to ride out the +-1.5 MB
//   boundary noise measured, and fails above 20 MB;
// - geometries, textures and colliders fail when they rise in >= 3 of the last 10 steps without
//   ever falling back;
// - any page error fails (a RangeError stack overflow included);
// - the gate needs 11 cycles after warm-up, 15 in all (about 9 minutes with the soak's cycle).

const MIB = 1048576

export const SOAK_GATE = {
  warmupCycles: 4,
  retainedHeapGrowthBytes: 20 * MIB,
  heapMedianOf: 3,
  /** Fewer settled boundaries than this and the heap rule has no first and last 3 to compare. */
  heapMinSettledCycles: 6,
  trendSteps: 10,
  minRisingSteps: 3,
  trendFields: ['geometries', 'textures', 'rapierColliders'],
}

/** Every reason the soak fails, in rule order; empty when it passes. */
export function listSoakGateFailures(boundaries, pageErrors) {
  const settled = boundaries.slice(SOAK_GATE.warmupCycles)
  return [
    ...listTooFewCycles(settled),
    ...listHeapGrowth(settled),
    ...SOAK_GATE.trendFields.flatMap((field) => listRisingCount(settled, field)),
    ...listPageErrors(pageErrors),
  ]
}

function listTooFewCycles(settled) {
  const needed = SOAK_GATE.trendSteps + 1
  if (settled.length >= needed) return []
  return [`only ${settled.length} cycles after warm-up; the gate needs ${needed}`]
}

function listHeapGrowth(settled) {
  if (settled.length < SOAK_GATE.heapMinSettledCycles) return []
  const first = medianHeapOf(settled.slice(0, SOAK_GATE.heapMedianOf))
  const last = medianHeapOf(settled.slice(-SOAK_GATE.heapMedianOf))
  const growth = last - first
  if (growth <= SOAK_GATE.retainedHeapGrowthBytes) return []
  const limitMB = SOAK_GATE.retainedHeapGrowthBytes / MIB
  return [`retained heap grew ${(growth / MIB).toFixed(1)} MB (> ${limitMB} MB)`]
}

function listRisingCount(settled, field) {
  const tail = settled.slice(-(SOAK_GATE.trendSteps + 1)).map((boundary) => boundary[field])
  const steps = tail.slice(1).map((value, at) => value - tail[at])
  const rises = steps.filter((step) => step > 0).length
  const isClimbing = rises >= SOAK_GATE.minRisingSteps && steps.every((step) => step >= 0)
  if (!isClimbing) return []
  return [
    `${field} rose in ${rises} of the last ${steps.length} cycles and never fell: ${tail.join(' → ')}`,
  ]
}

function listPageErrors(pageErrors) {
  if (pageErrors.length === 0) return []
  return [`${pageErrors.length} page error(s): ${pageErrors[0]}`]
}

/** The upper middle for an even count, as the perf pass measured it. */
function medianHeapOf(boundaries) {
  const sorted = boundaries.map((boundary) => boundary.usedJSHeapSize).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
