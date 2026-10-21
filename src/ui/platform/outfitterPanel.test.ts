import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../../systems/authority/scriptedSession'
import { grantMoneyCommand } from '../../systems/startScenarioCommands'
import { outfitterCardsOf } from '../../systems/views/outfitterCards'
import { selectUpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { UI_ID_TEMPLATES } from '../ids'
import { OutfitterPanelView } from './OutfitterPanel'

// The Outfitter as drawn (ticket 687): each card carries its bay button's id, greys its price
// while the wallet is short, and lights where the game's menu focus is (a pad's d-pad).

function drawnOutfitter(money: string, focusedId: string | null): string {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand(money))
  dockInBay(session, 2, 'upgrade')
  const model = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  return renderToString(
    createElement(OutfitterPanelView, { cards: outfitterCardsOf(model), focusedId }),
  )
}

/** The opening tag of the card carrying `testId`. */
function cardTagOf(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`)
  expect(at, `${testId} is drawn`).toBeGreaterThanOrEqual(0)
  return html.slice(html.lastIndexOf('<button', at), html.indexOf('>', at) + 1)
}

const ENGINE_BUY = UI_ID_TEMPLATES.workshopUpgradeBuy('engine')

describe('outfitter panel', () => {
  it('lights the card the menu focus is on and shows its line, and only that one', () => {
    const html = drawnOutfitter('1e9', ENGINE_BUY)
    expect(cardTagOf(html, ENGINE_BUY)).toContain('data-focused="true"')
    expect(cardTagOf(html, ENGINE_BUY)).toContain('data-revealed="true"')
    expect(html.match(/data-focused="true"/g)).toHaveLength(1)
  })

  it('greys the price of a card the wallet is short for', () => {
    expect(cardTagOf(drawnOutfitter('0', null), ENGINE_BUY)).toContain('data-muted="true"')
    expect(cardTagOf(drawnOutfitter('1e9', null), ENGINE_BUY)).not.toContain('data-muted')
  })
})
