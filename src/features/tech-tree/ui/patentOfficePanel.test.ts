import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { patentCardsOf } from '../systems/patentCards'
import { registeredTechTree } from '../systems/techTree'
import { treeScreenModelOf } from '../systems/treeScreenModel'
import { LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { nodeTestIdOf } from './nodeTestIds'
import { PatentOfficePanelView } from './PatentOfficePanel'
import type { AuthorityState } from '../../../systems/authority/authorityState'

const walletOf = (state: AuthorityState) => state.players[PLAYER].wallet

// The Patent Office as drawn (ticket 687): a sheet card per node carrying the node's test id, its
// price greyed while the wallet is short, its line the gain text, never a stat table.

const GRAPPLE = 'tech.mobility.grapple_winch'

function drawnPatentOffice(money: string): string {
  return withFixtureTree(() => {
    const session = sessionOnPlanet(3, money)
    const tree = registeredTechTree()
    const model = treeScreenModelOf(session.state(), PLAYER, tree, { search: '', filters: [] })
    const cards = patentCardsOf(model, tree, walletOf(session.state()))
    return renderToString(createElement(PatentOfficePanelView, { cards, onResearch: () => {} }))
  }, [LAB_FIXTURE_SLICE])
}

function cardTagOf(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`)
  expect(at, `${testId} is drawn`).toBeGreaterThanOrEqual(0)
  return html.slice(html.lastIndexOf('<button', at), html.indexOf('>', at) + 1)
}

describe('patent office panel', () => {
  it('draws each node as a sheet card under its node test id', () => {
    const html = drawnPatentOffice('1e30')
    expect(cardTagOf(html, nodeTestIdOf(GRAPPLE))).toContain('data-sheet-card="tech-tree.patent.')
    expect(html).not.toContain('<table')
  })

  it('greys a node’s price while the wallet is short', () => {
    expect(cardTagOf(drawnPatentOffice('0'), nodeTestIdOf(GRAPPLE))).toContain('data-muted="true"')
    expect(cardTagOf(drawnPatentOffice('1e30'), nodeTestIdOf(GRAPPLE))).not.toContain('data-muted')
  })
})
