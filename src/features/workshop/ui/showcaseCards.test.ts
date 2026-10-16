import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { readUpgradeBayModel } from '../../../store/screenReads'
import { resetWorkshopStore } from '../store/workshopStore'
import { ShowcaseView, type PlaqueLayout } from './ShowcaseScreen'
import { WORKSHOP_TEST_IDS } from './testIds'

// #164's described-row contract on the showcase (GD and TD, 7 Oct): each plaque is its track's
// compact item card, carrying `data-item-card` and the buy id once, and a first tap opens it in
// place with the level text, buying nothing; the hold stays on its Buy.

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  resetWorkshopStore()
  game().giveMoney('1e9')
  game().teleportToDock('upgrade')
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

function showcaseMarkup(plaqueLayout: PlaqueLayout = 'beside'): string {
  const focusedId = game().focusedControlId ?? ''
  const model = readUpgradeBayModel()
  return renderToString(createElement(ShowcaseView, { model, focusedId, plaqueLayout }))
}

function countOf(html: string, fragment: string): number {
  return html.split(fragment).length - 1
}

/** The opening tag of the element carrying this test id. */
function tagOf(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`)
  expect(at, `${testId} is drawn`).toBeGreaterThanOrEqual(0)
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at))
}

function tipStep(): number {
  return readAuthorityState().players[game().playerId].vehicle.levels.drill_tip
}

describe('workshop: the plaques as item cards', () => {
  it.each(['beside', 'carousel'] as const)(
    'draws each plaque as its track’s compact card, carrying the buy id once (%s)',
    (plaqueLayout) => {
      const html = showcaseMarkup(plaqueLayout)
      for (const row of readUpgradeBayModel().tracks) {
        expect(countOf(html, `data-testid="${row.buy.id}"`), row.buy.id).toBe(1)
        expect(tagOf(html, row.buy.id)).toContain('data-variant="compact"')
        expect(tagOf(html, row.buy.id)).toContain('data-item-card=')
        expect(countOf(html, `data-testid="${WORKSHOP_TEST_IDS.plaqueBuy(row.upgradeId)}"`)).toBe(1)
      }
    },
  )

  // #173 section 3 on an upright phone (#470 PT-5): one carousel of every plaque, no leader lines.
  it('lays every plaque in the one carousel and drops the leader lines on an upright phone', () => {
    const html = showcaseMarkup('carousel')
    const carouselAt = html.indexOf(`data-testid="${WORKSHOP_TEST_IDS.carousel}"`)
    expect(carouselAt).toBeGreaterThanOrEqual(0)
    for (const row of readUpgradeBayModel().tracks) {
      expect(html.indexOf(`data-plaque="${row.upgradeId}"`), row.upgradeId).toBeGreaterThan(
        carouselAt,
      )
    }
    expect(countOf(html, 'data-leader=')).toBe(0)
    expect(countOf(showcaseMarkup('beside'), 'data-leader=')).toBeGreaterThan(0)
  })

  it('opens a plaque’s card on the first tap with its level text, buying nothing', () => {
    const tip = readUpgradeBayModel().tracks[1]
    game().tapItemCard(tip.buy.id)
    const html = showcaseMarkup()

    expect(tagOf(html, tip.buy.id)).toContain('aria-expanded="true"')
    expect(html.replace(/<!-- -->/g, '')).toContain('Level 0 → 0 · 1/9')
    expect(countOf(html, 'aria-expanded="true"')).toBe(1)
    expect(tipStep()).toBe(0)
  })
})
