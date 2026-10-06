// Turns what a measurement prints or writes into one flat map of metric ids to numbers, the
// shape of `metrics` in docs/perf/history.ndjson. Pure: no fs, no clock, no child processes.
//
// Metric ids come from the measurement's own names, so a bench that prints a new timing field
// produces a new id (and a new chart on /status/) without touching this file:
//   bench line  {"bench":"generateChunk","planetIndex":1,"p95Ms":1.6}  -> generateChunk.p1.p95Ms
//   bench line  {"bench":"groundDrilling","carveP95Ms":6.5}            -> groundDrilling.carveP95Ms

const DECIMALS = 1000

/** Rounds to 3 decimals so float noise (183.29999999998836) never reaches the history. */
export function roundMetric(value) {
  return Math.round(value * DECIMALS) / DECIMALS
}

export function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// A bench field is a metric when it is a timing (...Ms) or a peak count (...Max); budgets and
// workload sizes (chunks, ticks, reports) describe the run instead.
function isBenchMetricField(key, value) {
  const isMeasured = key.endsWith('Ms') || key.endsWith('Max')
  return isMeasured && !key.startsWith('budget') && Number.isFinite(value)
}

function benchCaseOf(line) {
  return line.planetIndex === undefined ? line.bench : `${line.bench}.p${line.planetIndex}`
}

/** One JSON line printed by an `npm run bench:*` script -> its metrics. */
export function metricsOfBenchLine(line) {
  const metrics = {}
  for (const [key, value] of Object.entries(line)) {
    if (isBenchMetricField(key, value)) metrics[`${benchCaseOf(line)}.${key}`] = roundMetric(value)
  }
  return metrics
}

/** Several runs of the same benches -> the median of each metric over the runs that have it. */
export function medianMetricsOf(runs) {
  const valuesById = new Map()
  for (const run of runs) {
    for (const [id, value] of Object.entries(run)) {
      valuesById.set(id, [...(valuesById.get(id) ?? []), value])
    }
  }
  return Object.fromEntries(
    [...valuesById].map(([id, values]) => [id, roundMetric(medianOf(values))]),
  )
}

// The memory soak's summary.json (scripts/soak/soakMemory.mjs in the perf pass) -> soak.* ids.
const SOAK_SUMMARY_FIELDS = {
  heapFirstBoundaryMB: 'soak.heapStartMB',
  heapLastBoundaryMB: 'soak.heapEndMB',
  peakUsedJSHeapMB: 'soak.heapPeakMB',
  heapSlopeMBperCycle: 'soak.heapGrowthMBPerCycle',
  heapSlopeAfterCycle4MBperMin: 'soak.heapSlopeAfterWarmupMBPerMin',
  peakWasmMB: 'soak.wasmPeakMB',
  runLogTextMBperMin: 'soak.runLogMBPerMin',
  frameP50median: 'soak.frameP50Ms',
  frameP95median: 'soak.frameP95Ms',
}

// The soak's raw soak.json: what is still allocated at the last cycle boundary (after GC).
const SOAK_BOUNDARY_FIELDS = {
  geometries: 'soak.geometriesAtLastBoundary',
  textures: 'soak.texturesAtLastBoundary',
  rapierColliders: 'soak.collidersAtLastBoundary',
}

// A browser CPU profile summary: inclusive share of all main-thread samples.
const PROFILE_FIELDS = {
  snapshotOf: 'profile.snapshotOfMainThreadPct',
  '(garbage collector)': 'profile.garbageCollectorMainThreadPct',
}

const STATE_DEPTH_FIELDS = {
  authorityStateDepth: 'stack.authorityStateDepth',
  snapshotDepth: 'stack.snapshotDepth',
}

function renameFields(source, fields) {
  const metrics = {}
  for (const [from, id] of Object.entries(fields)) {
    if (Number.isFinite(source[from])) metrics[id] = roundMetric(source[from])
  }
  return metrics
}

function metricsOfBenchSummary(file) {
  const metrics = {}
  for (const row of file.summary) {
    if (isBenchMetricField(row.metric, row.median)) {
      metrics[`${row.case.replace(/\s+/g, '.')}.${row.metric}`] = roundMetric(row.median)
    }
  }
  return metrics
}

function metricsOfSoakRun(file) {
  return renameFields(file.boundaries.at(-1), SOAK_BOUNDARY_FIELDS)
}

function walkerNameOf(stressName) {
  return stressName.split('(')[0]
}

// Deepest tested nesting each walker survived before its first RangeError; walkers that never
// failed have no measured limit, so they record nothing.
function metricsOfStackStress(file) {
  const suffix = file.stackSizeFlag === 'default' ? '' : `Stack${file.stackSizeFlag}`
  const deepestOk = new Map()
  const failed = new Set()
  for (const result of [...file.results].sort((a, b) => a.depth - b.depth)) {
    const walker = walkerNameOf(result.name)
    if (result.outcome !== 'ok') failed.add(walker)
    else if (!failed.has(walker)) deepestOk.set(walker, result.depth)
  }
  const metrics = {}
  for (const walker of failed) {
    if (deepestOk.has(walker))
      metrics[`stack.${walker}.maxOkDepth${suffix}`] = deepestOk.get(walker)
  }
  return metrics
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Each known measurement file, recognised by its shape. A new kind of measurement either writes
// `{"metrics": {...}}` (recorded as is) or gets one entry here.
const FILE_KINDS = [
  { kind: 'metrics', matches: (f) => isRecord(f.metrics), read: (f) => f.metrics },
  {
    kind: 'bench-summary',
    matches: (f) => Array.isArray(f.summary) && f.summary.every((r) => r.case && r.metric),
    read: metricsOfBenchSummary,
  },
  {
    kind: 'soak-summary',
    matches: (f) => Number.isFinite(f.heapSlopeMBperCycle),
    read: (f) => renameFields(f, SOAK_SUMMARY_FIELDS),
  },
  {
    kind: 'soak-run',
    matches: (f) => Array.isArray(f.boundaries) && f.boundaries.length > 0,
    read: metricsOfSoakRun,
  },
  {
    kind: 'cpu-profile-summary',
    matches: (f) => isRecord(f.inclusivePct),
    read: (f) => renameFields(f.inclusivePct, PROFILE_FIELDS),
  },
  {
    kind: 'stack-depth',
    matches: (f) => Number.isFinite(f.snapshotDepth),
    read: (f) => renameFields(f, STATE_DEPTH_FIELDS),
  },
  {
    kind: 'stack-stress',
    matches: (f) => typeof f.stackSizeFlag === 'string' && Array.isArray(f.results),
    read: metricsOfStackStress,
  },
]

/** A parsed measurement file -> `{ kind, metrics }`; throws on a shape nobody knows. */
export function metricsOfMeasurementFile(file) {
  const known = isRecord(file) ? FILE_KINDS.find((k) => k.matches(file)) : undefined
  if (!known) {
    const kinds = FILE_KINDS.map((k) => k.kind).join(', ')
    throw new Error(`unknown measurement file shape (known: ${kinds}; or write {"metrics":{...}})`)
  }
  return { kind: known.kind, metrics: known.read(file) }
}
