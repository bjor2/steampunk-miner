import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { entryProbeSlice, probeSourceOf } from '../../systems/registries/bayEntryFixtures'
import { outfitterCardsOf } from '../../systems/views/outfitterCards'
import { selectUpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { UI_ID_TEMPLATES } from '../ids'
import { OutfitterPanelView } from './OutfitterPanel'

// The bay entries as drawn on the Outfitter (tickets 344 and 687): an entry for sale is a card
// carrying its Buy id, a track at its wall reads Mastered and presses nothing.

function drawnOutfitter(): string {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  const model = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  const cards = outfitterCardsOf(model)
  return renderToString(createElement(OutfitterPanelView, { cards, focusedId: null }))
}

describe('the bay entries on the Outfitter (tickets 344, 687)', () => {
  it('draws the Buy of an entry for sale and Mastered with no Buy at the wall', () => {
    const { source } = probeSourceOf('entry-probe.tracks', 'bore_gun', [
      { entryId: 'entry-probe.rate' },
      { entryId: 'entry-probe.range', isMastered: true },
    ])
    const html = withRegistrations([entryProbeSlice([source])], drawnOutfitter)
    expect(html).toContain(
      `data-testid="${UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.rate')}"`,
    )
    expect(html).toContain('data-sheet-card="upgrade-bay.card.entry.entry-probe.range"')
    expect(html).not.toContain(UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.range'))
    expect(html).toContain('Mastered</span>')
  })

  it('draws no entry card with no entry registered', () => {
    const html = withRegistrations([], drawnOutfitter)
    expect(html).not.toContain('upgrade-bay.card.entry.')
  })
})
