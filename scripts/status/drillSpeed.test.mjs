import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DRILL_SPEED_LEVELS, readDrillSpeed, speedSeriesOf } from './drillSpeed.mjs'
import { renderDrillSpeed } from './drillSpeedHtml.mjs'

const VIEW = { repo: 'o/r', nowMs: Date.parse('2026-10-16T08:00:00Z') }

/** A history as it sits on test-metrics, from scripts/status/fixtures/drill-speed/. */
const fixtureOf = (name) =>
  readFileSync(new URL(`./fixtures/drill-speed/${name}.ndjson`, import.meta.url), 'utf8')

const ALL_LEVELS = {
  ladderText: fixtureOf('ladder-all-levels'),
  drillDownText: fixtureOf('drill-down-all-levels'),
}
const SOME_LEVELS = {
  ladderText: fixtureOf('ladder-some-levels'),
  drillDownText: fixtureOf('drill-down-some-levels'),
}
const NO_DATA = { ladderText: null, drillDownText: '' }

const point = (commit, value) => ({ commit, measuredAt: `2026-10-16T0${commit}:00:00Z`, value })
const rounded = (value, places = 3) => (value === null ? null : Number(value.toFixed(places)))

describe('drill speed series (ticket 434)', () => {
  it('takes the latest value and its change since the run before from the history', () => {
    const series = speedSeriesOf([point(1, 1.5), point(2, 1.2), point(3, 1.25)])
    expect(series).toMatchObject({ latest: 1.25, previous: 1.2, runCount: 3 })
    expect(rounded(series.change)).toBe(0.05)
    expect(series.trend.map((entry) => entry.value)).toEqual([1.5, 1.2, 1.25])
  })

  it('gives a single run as the latest with no change', () => {
    expect(speedSeriesOf([point(1, 1.5)])).toMatchObject({
      latest: 1.5,
      previous: null,
      change: null,
      runCount: 1,
    })
  })

  it('has no series at all without a run, never a speed of 0', () => {
    expect(speedSeriesOf([])).toBeNull()
  })
})

describe('drill speed panel model (ticket 434)', () => {
  it('joins the ladder cut and the browser descent of each level from the stored rows', () => {
    const model = readDrillSpeed(ALL_LEVELS)
    expect(model.levels.map((level) => level.level)).toEqual(DRILL_SPEED_LEVELS)
    const [first] = model.levels
    expect(first.cut).toMatchObject({ latest: 1.509, previous: 1.5, runCount: 2 })
    expect(rounded(first.cut.change)).toBe(0.009)
    expect(first.descent).toMatchObject({ latest: 1.2, previous: 0.9, runCount: 2 })
    expect(rounded(first.descentShare)).toBe(0.795)
    expect(model).toMatchObject({ ladderRunCount: 2, drillDownRunCount: 10 })
  })

  it("gives each step the cut's, the law's and the descent's gain on the level before", () => {
    const [firstStep] = readDrillSpeed(ALL_LEVELS).steps
    expect(firstStep).toMatchObject({ from: 1, to: 5, lawGain: 1.026 })
    expect(rounded(firstStep.cutGain)).toBe(1.025)
    expect(rounded(firstStep.descentGain)).toBe(1.033)
  })

  it('leaves a level with no run empty and its gains unknown', () => {
    const model = readDrillSpeed(SOME_LEVELS)
    const byLevel = Object.fromEntries(model.levels.map((level) => [level.level, level]))
    expect(byLevel[5]).toMatchObject({ cut: null, descent: null, descentShare: null })
    expect(byLevel[10].cut.latest).toBe(1.678)
    expect(model.steps[0]).toMatchObject({ cutGain: null, lawGain: null, descentGain: null })
  })

  it("does not take the law's gain from a ladder run that skipped the level before", () => {
    const { steps } = readDrillSpeed(SOME_LEVELS)
    expect(steps.find((step) => step.to === 10).lawGain).toBeNull()
  })

  it('reads no history as every level empty', () => {
    const model = readDrillSpeed(NO_DATA)
    expect(model.levels.every((level) => level.cut === null && level.descent === null)).toBe(true)
    expect(model).toMatchObject({ ladderRunCount: 0, drillDownRunCount: 0, updatedAt: null })
  })
})

describe('drill speed panel drawing (ticket 434)', () => {
  it('draws every level with its speeds, change, share of the cut and gains', () => {
    const html = renderDrillSpeed(readDrillSpeed(ALL_LEVELS), VIEW)
    expect(html).toContain('<b class="ds-big">1.51</b> m/s')
    expect(html).toContain('+0.01')
    expect(html).toContain('<b class="ds-big">80%</b>')
    expect(html).toContain('cut <b>×1.025</b> · law ×1.026 · descent <b>×1.033</b>')
    expect(html).toContain('stored 10 equals major 1')
    expect(html).not.toContain('no run yet')
  })

  it('draws the levels it has and says "no run yet" for the others', () => {
    const html = renderDrillSpeed(readDrillSpeed(SOME_LEVELS), VIEW)
    expect(html).toContain('<b class="ds-big">1.68</b> m/s')
    // Levels 5, 15 and 20: cut, descent and share each.
    expect(html.match(/no run yet/g)).toHaveLength(3 * 3)
    expect(html).toContain('first run')
  })

  it('draws the panel with no data as "no run yet" in every cell, never 0', () => {
    const html = renderDrillSpeed(readDrillSpeed(NO_DATA), VIEW)
    expect(html.match(/no run yet/g)).toHaveLength(DRILL_SPEED_LEVELS.length * 3)
    expect(html).not.toMatch(/ds-big">0(\.00)?</)
    expect(html).toContain('updated —')
  })
})
