import { describe, expect, it } from 'vitest'
import { DESIGN_TOKENS } from './designSystem'
import { sheetPlacementOf, sheetTabBarOf, sheetTransitionOf } from './sheetLayout'

// The shared sheet (spec #678, ticket 686): full screen on a phone, docked beside the view on
// desktop (GD lock, 21 Oct), a 200 ms shutter that fades under Reduce Motion, about 8 tabs before
// the bar scrolls.

const tabsOf = (count: number) => Array.from({ length: count }, (_, at) => `probe.tab-${at}`)

describe('sheet placement', () => {
  it('fills the screen on a phone, upright or sideways', () => {
    expect(sheetPlacementOf('phone', 360)).toBe('full')
    expect(sheetPlacementOf('phone', 844)).toBe('full')
  })

  it('docks beside the play view on desktop at the screenshot cells', () => {
    expect(sheetPlacementOf('desktop', 1280)).toBe('docked')
    expect(sheetPlacementOf('desktop', 1440)).toBe('docked')
  })

  it('covers a desktop window too narrow to keep the view beside the dock', () => {
    const { widthPx, minViewPx } = DESIGN_TOKENS.layout.sheetDock
    expect(sheetPlacementOf('desktop', widthPx + minViewPx)).toBe('docked')
    expect(sheetPlacementOf('desktop', widthPx + minViewPx - 1)).toBe('full')
  })
})

describe('sheet transition', () => {
  it('slides the shutter over the sheet duration, within the 200 ms motion cap', () => {
    const transition = sheetTransitionOf(false)
    expect(transition).toEqual({ kind: 'shutter', ms: DESIGN_TOKENS.motion.durationsMs.sheet })
    expect(transition.ms).toBeLessThanOrEqual(DESIGN_TOKENS.motion.transitionMaxMs)
  })

  it('fades over the same time under Reduce Motion, so nothing is dropped', () => {
    expect(sheetTransitionOf(true)).toEqual({ kind: 'fade', ms: sheetTransitionOf(false).ms })
  })
})

describe('sheet tab bar', () => {
  it('shows the tab asked for', () => {
    expect(sheetTabBarOf(tabsOf(3), 'probe.tab-2').activeTabId).toBe('probe.tab-2')
  })

  it('falls back to the first tab when the asked one is not shown', () => {
    expect(sheetTabBarOf(tabsOf(3), 'probe.gone').activeTabId).toBe('probe.tab-0')
    expect(sheetTabBarOf(tabsOf(3), null).activeTabId).toBe('probe.tab-0')
  })

  it('has no active tab when no tab is shown', () => {
    expect(sheetTabBarOf([], 'probe.tab-0').activeTabId).toBeNull()
  })

  it('scrolls sideways only past the design tab budget', () => {
    const tabsMax = DESIGN_TOKENS.layout.tabsMax
    expect(sheetTabBarOf(tabsOf(tabsMax), null).isScrolling).toBe(false)
    expect(sheetTabBarOf(tabsOf(tabsMax + 1), null).isScrolling).toBe(true)
  })

  it('keeps every tab past the budget instead of dropping one', () => {
    expect(sheetTabBarOf(tabsOf(12), 'probe.tab-11').tabIds).toHaveLength(12)
    expect(sheetTabBarOf(tabsOf(12), 'probe.tab-11').activeTabId).toBe('probe.tab-11')
  })
})
