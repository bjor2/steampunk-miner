import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { drawSoakChart } from './soakChart.mjs'

/** The cycle boundaries of a real 10-minute `npm run soak:memory` (18 cycles, no page error). */
const REAL_SOAK = JSON.parse(
  readFileSync(new URL('./fixtures/soak-boundaries.json', import.meta.url), 'utf8'),
)

const MIB = 1048576

function shortRun(heapsMB) {
  return {
    pageErrors: [],
    boundaries: heapsMB.map((heapMB, at) => ({
      cycle: at + 1,
      usedJSHeapSize: heapMB * MIB,
      geometries: 31,
      textures: 18,
      rapierColliders: 4,
    })),
  }
}

describe('memory soak chart', () => {
  it('titles the chart with the gate verdict, the cycle count and the build it soaked', () => {
    expect(drawSoakChart(REAL_SOAK)).toContain('Memory soak: PASS, 18 cycles, browser build')
  })

  it('titles a run with a page error as a failure', () => {
    const chart = drawSoakChart({ ...REAL_SOAK, pageErrors: ['RangeError: Maximum call stack'] })

    expect(chart).toContain('Memory soak: FAIL, 18 cycles')
  })

  it('marks the heap limit 20 MB above the median of the first three settled boundaries', () => {
    expect(drawSoakChart(REAL_SOAK)).toContain('gate limit 66.2 MB')
  })

  it('gives every cycle boundary its retained heap as a tooltip', () => {
    const chart = drawSoakChart(REAL_SOAK)
    const heapTooltips = chart.match(/<title>cycle \d+: [\d.]+ MB<\/title>/g)

    expect(heapTooltips).toHaveLength(18)
    expect(heapTooltips[0]).toBe('<title>cycle 1: 44.0 MB</title>')
    expect(heapTooltips[17]).toBe('<title>cycle 18: 48.2 MB</title>')
  })

  it('labels the heap and each count at the last boundary', () => {
    const chart = drawSoakChart(REAL_SOAK)

    for (const label of ['heap 48.2', 'geometries 35', 'textures 21', 'colliders 4']) {
      expect(chart).toContain(`>${label}</text>`)
    }
  })

  it('draws no heap limit on a run too short for the heap rule', () => {
    const chart = drawSoakChart(shortRun([40, 41, 42]))

    expect(chart).toContain('Memory soak: FAIL, 3 cycles')
    expect(chart).toContain('>heap 42.0</text>')
    expect(chart).not.toContain('gate limit')
  })
})
