import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { entryProbeSlice, probeSourceOf } from '../../systems/registries/bayEntryFixtures'
import { selectUpgradeBayModel } from '../../systems/views/upgradeBayModel'
import { UI_ID_TEMPLATES } from '../ids'
import { TracksPanel } from './TracksPanel'

// The bay entry rows as drawn (ticket 344): a row for sale carries its Buy id, a track at its
// wall reads Mastered and draws no Buy.

function drawnBay(): string {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  const model = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  return renderToString(createElement(TracksPanel, { model, focusedId: '' }))
}

describe('the bay entry rows as drawn (ticket 344)', () => {
  it('draws the Buy of an entry for sale and Mastered with no Buy at the wall', () => {
    const { source } = probeSourceOf('entry-probe.tracks', 'bore_gun', [
      { entryId: 'entry-probe.rate' },
      { entryId: 'entry-probe.range', isMastered: true },
    ])
    const html = withRegistrations([entryProbeSlice([source])], drawnBay)
    expect(html).toContain(
      `data-testid="${UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.rate')}"`,
    )
    expect(html).toContain(`data-testid="${UI_ID_TEMPLATES.upgradebayEntry('entry-probe.range')}"`)
    expect(html).not.toContain(UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.range'))
    expect(html).toContain('Mastered</span>')
  })

  it('draws the bay exactly as before with no entry registered', () => {
    const html = withRegistrations([], drawnBay)
    expect(html).not.toContain('upgradebay-entry-')
  })
})
