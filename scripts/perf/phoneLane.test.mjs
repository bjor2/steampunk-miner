import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PHONE_LANE_FIELDS,
  PHONE_LANE_GROUP,
  phoneLaneEnvOf,
  phoneLaneMetricIdsOf,
  phoneLaneMetricsOf,
  phoneLaneRegistryOf,
  tickCostLinesOf,
} from './phoneLane.mjs'

const PLAN = JSON.parse(
  readFileSync(new URL('../../e2e/browser/mobile/perfPhonePlan.json', import.meta.url), 'utf8'),
)
const REGISTRY = JSON.parse(
  readFileSync(new URL('../../docs/perf/metrics.json', import.meta.url), 'utf8'),
)

function readingAt(id, speedMetresPerSecond, tickMsP95) {
  return {
    id,
    speedMetresPerSecond,
    tickMsP95,
    frameMsP95: 41.7,
    ticksDroppedByCap: 12,
    renderScale: 0.75,
    internalWidth: 1801,
    internalHeight: 811,
    jsHeapMB: 88.12345,
    domNodes: 2104,
  }
}

const RATE_FILE = {
  cpuThrottleRate: 4,
  cases: [readingAt('at0', 0, 1.2), readingAt('at3600', 3600, 7.25)],
}

describe('phone perf lane', () => {
  it('names each reading by rate, case and field, rounded to 3 decimals', () => {
    const { metrics } = phoneLaneMetricsOf(RATE_FILE)
    expect(metrics['phone.cpu4x.at3600.tickMsP95']).toBe(7.25)
    expect(metrics['phone.cpu4x.at0.jsHeapMB']).toBe(88.123)
    expect(Object.keys(metrics)).toHaveLength(2 * PHONE_LANE_FIELDS.length)
  })

  it('refuses a reading that is not a number rather than record it', () => {
    const broken = {
      cpuThrottleRate: 6,
      cases: [{ ...readingAt('at96', 96, 2), frameMsP95: null }],
    }
    expect(() => phoneLaneMetricsOf(broken)).toThrow('at96.frameMsP95 is not a number')
  })

  it('records each rate under the env the TD named', () => {
    expect(phoneLaneEnvOf(6)).toBe('Chromium CPU throttled 6x, SwiftShader')
  })

  it('has every id the plan can write registered on the Performance tab, in its own group', () => {
    const ids = phoneLaneMetricIdsOf(PLAN)
    expect(ids).toHaveLength(
      PLAN.cpuThrottleRates.length * PLAN.cases.length * PHONE_LANE_FIELDS.length,
    )
    expect(REGISTRY.groups).toContain(PHONE_LANE_GROUP)
    const registered = Object.fromEntries(ids.map((id) => [id, REGISTRY.metrics[id]]))
    expect(registered).toEqual(phoneLaneRegistryOf(PLAN))
  })

  it('holds only the tick cost to the 6 ms target', () => {
    const budgeted = Object.entries(phoneLaneRegistryOf(PLAN)).filter(([, entry]) => entry.budget)
    expect(budgeted.every(([id]) => id.endsWith('.tickMsP95'))).toBe(true)
    expect(new Set(budgeted.map(([, entry]) => entry.budget))).toEqual(new Set([6]))
  })

  it('prints a case over the target as over, and one within it as within', () => {
    expect(tickCostLinesOf(RATE_FILE, 6)).toEqual([
      '4x CPU, 0 m/s: tick p95 1.2 ms (within the 6 ms target), 12 ticks dropped',
      '4x CPU, 3600 m/s: tick p95 7.25 ms (OVER the 6 ms target), 12 ticks dropped',
    ])
  })
})
