import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { readSellBayModel, readShownBayPanelIds } from '../../store/screenReads'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { BayPanelPages } from '../../ui/platform/BayPanelList'
import { SellBayView } from '../../ui/platform/SellBayView'
import { exampleDebugActions } from './debug'
import { showSampleMerchants } from './store/bayPanelProbeStore'

// The example's sample merchants on the Sell bay's panel slot (ticket 845): hidden for players,
// shown 1 to 5 by a debug action for the kernel e2e and the screenshot suite.

const showBayPanels = (count: unknown) => exampleDebugActions.showBayPanels!(count)

beforeEach(() => {
  showSampleMerchants(0)
  forgetUiTexts()
})

describe('example sample merchants', () => {
  it('keeps every sample merchant off the Sell bay until a spec shows them', () => {
    expect(readShownBayPanelIds('sell')).toEqual([])
  })

  it('shows the first merchants a spec asks for, in order', () => {
    expect(showBayPanels(5)).toEqual({ ok: true })
    expect(readShownBayPanelIds('sell')).toEqual([
      'example.merchant-1',
      'example.merchant-2',
      'example.merchant-3',
      'example.merchant-4',
      'example.merchant-5',
    ])
    expect(showBayPanels(1)).toEqual({ ok: true })
    expect(readShownBayPanelIds('sell')).toEqual(['example.merchant-1'])
  })

  it('refuses a count that is not a whole number from 0 to 5, changing nothing', () => {
    showBayPanels(2)
    for (const count of [6, -1, 1.5, '3', undefined]) {
      expect(showBayPanels(count)).toMatchObject({ ok: false })
    }
    expect(readShownBayPanelIds('sell')).toHaveLength(2)
  })

  it('draws five merchants on a phone on registered elements within the text budget', () => {
    showBayPanels(5)
    const panelIds = readShownBayPanelIds('sell')
    const markup = renderToString(createElement(BayPanelPages, { panelIds, layout: 'phone' }))
    expect(markup).toContain('Boilerhouse')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('draws the Sell bay with a desktop page of merchants and its pager on registered elements', () => {
    showBayPanels(5)
    const model = readSellBayModel()
    const markup = renderToString(createElement(SellBayView, { model, focusedId: '' }))
    expect(markup).toContain('data-page-count="3"')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })
})
