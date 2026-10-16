import { describe, expect, it } from 'vitest'
import { calloutTextOf, readoutTextOf, statusLabelTextOf } from './hudCallouts'
import { uiTextProblemsOf } from './uiTextBudget'
import { elementLinesOf, type ElementText } from './uiText'

// Spec #422, pass #428: the HUD's call-outs keep every word of the model's sentence, split into a
// title and one line that fit the budget.

function problemsOf(text: ElementText): string[] {
  return uiTextProblemsOf({ ...text, lines: elementLinesOf(text, [], null) })
}

describe('HUD call-outs', () => {
  it('titles a warning by the words before its colon and keeps the rest as the one line', () => {
    const text = calloutTextOf('hud.warning', 'LOW ENERGY: head for the platform')
    expect(text.title).toBe('LOW ENERGY')
    expect(text.oneLine).toBe('head for the platform')
  })

  it('splits a prompt at its dash when it has no colon', () => {
    const text = calloutTextOf('hud.prompt.ready', 'Scenario ready — press any key')
    expect([text.title, text.oneLine]).toEqual(['Scenario ready', 'press any key'])
  })

  it('splits only at the first separator, so a later colon stays in the one line', () => {
    const text = calloutTextOf('hud.prompt.dock', 'Space: Dock at the Sell bay: now')
    expect([text.title, text.oneLine]).toEqual(['Space', 'Dock at the Sell bay: now'])
  })

  it('keeps a short call-out with no separator as a title alone', () => {
    const text = calloutTextOf('hud.fuse', 'CHARGE LIT 1.5 s')
    expect([text.title, text.oneLine]).toEqual(['CHARGE LIT 1.5 s', ''])
  })

  it('draws a status icon’s words beside it, split like any call-out (ticket 476)', () => {
    const label = statusLabelTextOf({ id: 'collapse', text: 'COLLAPSE: back off' })
    expect(label).toEqual({
      id: 'hud.status.collapse',
      title: 'COLLAPSE',
      oneLine: 'back off',
      tooltipLines: [],
    })
  })

  it('leaves the fuse, low energy and tow icons unlabelled: their call-outs already say it', () => {
    const labels = ['fuse', 'low_energy', 'tow'].map((id) => statusLabelTextOf({ id, text: 'X' }))
    expect(labels).toEqual([null, null, null])
  })

  it('gives no element a tooltip, since no click reaches the HUD to open one', () => {
    expect(calloutTextOf('hud.fuse', 'CHARGE LIT 1.5 s: back off').tooltipLines).toEqual([])
    expect(readoutTextOf('hud.depth', 'Depth').tooltipLines).toEqual([])
  })

  it("keeps every HUD call-out of today's model within the text budget", () => {
    const callouts = [
      'LOW ENERGY: head for the platform',
      'CRITICAL ENERGY: climb home now',
      'CHARGE LIT 1.5 s: back off',
      'Left Shift: Dock at the Refinery bay',
      'Space: Ancient cache',
      'Scenario ready — press any key',
      'guns idle: low steam',
      'tow in 12 s',
    ]
    for (const callout of callouts) expect(problemsOf(calloutTextOf('hud.x', callout))).toEqual([])
  })
})
