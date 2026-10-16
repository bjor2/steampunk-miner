// The perf:phone lane's readings as performance history (#470 P1-10, ticket 481; the TD's section 5
// on #470). e2e/browser/mobile/perfPhone.spec.ts writes one file per CPU throttle rate,
// `{cpuThrottleRate, cases: [{id, speedMetresPerSecond, tickMsP95, ...}]}`; each becomes one
// history line of `phone.cpu<rate>x.<case>.<field>` ids, recorded under its own env. Pure: no fs,
// no clock, no child processes.
import { roundMetric } from './perfMetrics.mjs'

export const PHONE_LANE_GROUP = 'Phone lane (CPU-throttled emulation)'

// What each case records, in the order the TD listed them. Throttled SwiftShader gives CPU (tick)
// cost only; the frame and render numbers are software GL, never a phone GPU's.
export const PHONE_LANE_FIELDS = [
  { field: 'tickMsP95', label: 'Tick cost p95', unit: 'ms', better: 'lower' },
  { field: 'frameMsP95', label: 'Frame time p95 (SwiftShader)', unit: 'ms', better: 'lower' },
  {
    field: 'ticksDroppedByCap',
    label: 'Ticks the 30-step cap dropped in 15 s',
    unit: 'ticks',
    better: 'lower',
  },
  { field: 'renderScale', label: 'Settled render scale', unit: 'x', better: 'higher' },
  { field: 'internalWidth', label: 'Internal width', unit: 'px', better: 'higher' },
  { field: 'internalHeight', label: 'Internal height', unit: 'px', better: 'higher' },
  { field: 'jsHeapMB', label: 'JS heap', unit: 'MB', better: 'lower' },
  { field: 'domNodes', label: 'DOM nodes', unit: 'nodes', better: 'lower' },
]

const LANE_SOURCE =
  'npm run perf:phone (Pixel 7 Chromium, CDP CPU throttle, SwiftShader; emulation, not a device)'

export function phoneLaneMetricId(rate, caseId, field) {
  return `phone.cpu${rate}x.${caseId}.${field}`
}

/** The `--env` of a rate's history line. */
export function phoneLaneEnvOf(rate) {
  return `Chromium CPU throttled ${rate}x, SwiftShader`
}

/** One rate file -> `{metrics}`, the shape `perf:record --from` records as is. */
export function phoneLaneMetricsOf(rateFile) {
  const metrics = {}
  for (const reading of rateFile.cases) {
    for (const { field } of PHONE_LANE_FIELDS) {
      const value = reading[field]
      if (!Number.isFinite(value)) throw new Error(`${reading.id}.${field} is not a number`)
      metrics[phoneLaneMetricId(rateFile.cpuThrottleRate, reading.id, field)] = roundMetric(value)
    }
  }
  return { metrics }
}

/** Every id the plan's rates and cases can write, rate by rate and case by case. */
export function phoneLaneMetricIdsOf(plan) {
  return plan.cpuThrottleRates.flatMap((rate) =>
    plan.cases.flatMap((phoneCase) =>
      PHONE_LANE_FIELDS.map(({ field }) => phoneLaneMetricId(rate, phoneCase.id, field)),
    ),
  )
}

/** The `docs/perf/metrics.json` entries for the plan; the tick cost carries the TD's target. */
export function phoneLaneRegistryOf(plan) {
  const entries = {}
  for (const rate of plan.cpuThrottleRates) {
    for (const phoneCase of plan.cases) {
      for (const fieldEntry of PHONE_LANE_FIELDS) {
        const id = phoneLaneMetricId(rate, phoneCase.id, fieldEntry.field)
        entries[id] = registryEntryOf(plan, rate, phoneCase, fieldEntry)
      }
    }
  }
  return entries
}

function registryEntryOf(plan, rate, phoneCase, { field, label, unit, better }) {
  const where = `${rate}x CPU · ${phoneCase.speedMetresPerSecond} m/s`
  const budget = field === 'tickMsP95' ? { budget: plan.tickMsP95Target } : {}
  return {
    label: `${label} · ${where}`,
    unit,
    group: PHONE_LANE_GROUP,
    better,
    ...budget,
    source: LANE_SOURCE,
  }
}

/** One printed line per case: the tick cost against the target, report only. */
export function tickCostLinesOf(rateFile, target) {
  return rateFile.cases.map((reading) => {
    const verdict = reading.tickMsP95 <= target ? 'within' : 'OVER'
    const tick = roundMetric(reading.tickMsP95)
    return `${rateFile.cpuThrottleRate}x CPU, ${reading.speedMetresPerSecond} m/s: tick p95 ${tick} ms (${verdict} the ${target} ms target), ${reading.ticksDroppedByCap} ticks dropped`
  })
}
