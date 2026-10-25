import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { submitCommand } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { readSellBayModel, readShownBayPanelIds } from '../../../store/screenReads'
import { forgetUiTexts, registeredUiTexts } from '../../../systems/views/uiText'
import { uiTextProblemsOf } from '../../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../../systems/views/unregisteredText'
import { BayPanelPages } from '../../../ui/platform/BayPanelList'
import { SellBayView } from '../../../ui/platform/SellBayView'
import { planetKitDebugActions } from '../debug'
import { MERCHANT_PANEL_ID } from './MerchantPanel'

// The planet's merchant on the Sell bay's panel slot (ticket 821, PK2, over #845's `bayPanels`):
// shown where a merchant trades, on registered elements within the text budget, on a phone and on
// a desktop page.

beforeEach(() => {
  resetGameStore()
  forgetUiTexts()
})

function moveToPlanet(planetIndex: number): void {
  submitCommand(useGameStore.getState().playerId, {
    type: 'debug.setPlanet',
    payload: { planetIndex },
  })
}

const readMerchant = () => planetKitDebugActions.merchant!()

describe('merchant panel on the Sell bay', () => {
  it('shows the planet’s merchant on the Sell bay on planet 1', () => {
    expect(readShownBayPanelIds('sell')).toContain(MERCHANT_PANEL_ID)
    expect(readMerchant()).toMatchObject({ ok: true, merchant: { name: 'Hearthmoor Assay' } })
  })

  it('shows no merchant on a planet where none trades', () => {
    moveToPlanet(6)
    expect(readShownBayPanelIds('sell')).not.toContain(MERCHANT_PANEL_ID)
    expect(readMerchant()).toEqual({ ok: true, merchant: null })
  })

  it('draws the longest stock on a phone on registered elements within the text budget', () => {
    moveToPlanet(5)
    const markup = renderToString(
      createElement(BayPanelPages, { panelIds: [MERCHANT_PANEL_ID], layout: 'phone' }),
    )
    expect(markup).toContain('Boilerhouse')
    expect(markup).toContain('Pays extra for Chromite.')
    expect(markup).toContain('Vent Vane')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('draws the Sell bay with the merchant on a desktop page on registered elements', () => {
    const markup = renderToString(
      createElement(SellBayView, { model: readSellBayModel(), focusedId: '' }),
    )
    expect(markup).toContain(`data-bay-panel-id="${MERCHANT_PANEL_ID}"`)
    expect(markup).toContain('Cache Crate')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })
})
