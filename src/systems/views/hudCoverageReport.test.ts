import { describe, expect, it } from 'vitest'
import { NO_INSETS, type SafeInsets } from './hudCoverageBudget'
import {
  boxRectOf,
  coverageLineOf,
  hudCoverageReportOf,
  insetsOfSafeArea,
  type MeasuredHudBox,
} from './hudCoverageReport'

// Ticket 682 (spec #678): the coverage overlay's report. Done when it reports at most 12% on a
// phone and 8% on desktop: the design's reserved layout does on every #689 cell, and a measured
// HUD is judged against the same budget, with any box in the middle band named.

const PHONE = { width: 360, height: 640 }
const DESKTOP = { width: 1440, height: 900 }
const UPRIGHT_INSETS: SafeInsets = { top: 47, right: 0, bottom: 34, left: 0 }

function box(id: string, left: number, top: number, right: number, bottom: number): MeasuredHudBox {
  return { id, left, top, right, bottom }
}

describe('HUD coverage report', () => {
  it('reports the reserved phone layout at 12% or less at 360x640', () => {
    const report = hudCoverageReportOf({
      kind: 'phone',
      screen: PHONE,
      insets: UPRIGHT_INSETS,
      measured: [],
    })
    expect(report.reservedPercent).toBe(11.66)
    expect(report.budgetPercent).toBe(12)
    expect(report.isReservedWithinBudget).toBe(true)
  })

  it.each([
    ['1280x800', { width: 1280, height: 800 }],
    ['1440x900', DESKTOP],
  ])('reports the reserved desktop layout at 8%% or less at %s', (_, screen) => {
    const report = hudCoverageReportOf({ kind: 'desktop', screen, insets: NO_INSETS, measured: [] })
    expect(report.reservedPercent).toBeLessThanOrEqual(8)
    expect(report.budgetPercent).toBe(8)
    expect(report.isReservedWithinBudget).toBe(true)
  })

  it('counts a pixel under two measured boxes once', () => {
    const report = hudCoverageReportOf({
      kind: 'desktop',
      screen: { width: 100, height: 100 },
      insets: NO_INSETS,
      measured: [box('gauges', 0, 0, 10, 10), box('status', 5, 0, 15, 10)],
    })
    expect(report.measuredPercent).toBe(1.5)
  })

  it('judges a measured HUD over the budget as over, whatever the reserved layout says', () => {
    const report = hudCoverageReportOf({
      kind: 'phone',
      screen: PHONE,
      insets: NO_INSETS,
      measured: [box('readouts', 0, 0, 360, 100)],
    })
    expect(report.measuredPercent).toBe(15.63)
    expect(report.isMeasuredWithinBudget).toBe(false)
    expect(report.isReservedWithinBudget).toBe(true)
  })

  it('names every measured box that enters the middle band', () => {
    const report = hudCoverageReportOf({
      kind: 'phone',
      screen: PHONE,
      insets: NO_INSETS,
      measured: [box('gauges', 0, 0, 100, 40), box('threat', 150, 300, 200, 340)],
    })
    expect(report.middleBand).toEqual({ left: 8, top: 192, right: 352, bottom: 448 })
    expect(report.bandIntruderIds).toEqual(['threat'])
    expect(report.measured.map((measured) => measured.isInBand)).toEqual([false, true])
  })

  it('marks the top keep-out and the stick zone on a phone and neither on desktop', () => {
    const phone = hudCoverageReportOf({
      kind: 'phone',
      screen: PHONE,
      insets: NO_INSETS,
      measured: [],
    })
    const desktop = hudCoverageReportOf({
      kind: 'desktop',
      screen: DESKTOP,
      insets: NO_INSETS,
      measured: [],
    })
    expect(phone.topKeepOut).toEqual({ left: 0, top: 0, right: 360, bottom: 96 })
    expect(phone.stickZone).not.toBeNull()
    expect(desktop.topKeepOut).toBeNull()
    expect(desktop.stickZone).toBeNull()
  })

  it('pushes the reserved boxes in by the safe insets the safe area shows', () => {
    const insets = insetsOfSafeArea({ left: 0, top: 47, right: 360, bottom: 606 }, PHONE)
    expect(insets).toEqual(UPRIGHT_INSETS)
    const report = hudCoverageReportOf({ kind: 'phone', screen: PHONE, insets, measured: [] })
    expect(report.reserved.strip.top).toBe(47)
    expect(report.reserved.toolSlots.bottom).toBe(640 - 34 - 8)
  })

  it('writes one line with the measured share, the budget and the reserved layout', () => {
    const report = hudCoverageReportOf({
      kind: 'phone',
      screen: PHONE,
      insets: UPRIGHT_INSETS,
      measured: [box('readouts', 0, 0, 360, 100)],
    })
    expect(coverageLineOf(report)).toBe('HUD 15.63% / 12% · layout 11.66%')
  })

  it('draws a box from its corner with its width and height', () => {
    expect(boxRectOf({ left: 10, top: 20, right: 40, bottom: 80 })).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 60,
    })
  })
})
