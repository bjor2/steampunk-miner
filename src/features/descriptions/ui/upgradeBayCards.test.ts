import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { readUpgradeBayModel } from '../../../store/screenReads'
import { fromCanonical, sub, toCanonical } from '../../../systems/money'
import type { ScreenButton } from '../../../systems/views/viewParts'
import { UpgradeBayView } from '../../../ui/platform/UpgradeBayView'

// The described-row contract on #164 (Progression and Systems, 7 Oct): once this slice's describer
// answers, a tap on an Upgrade bay row opens its card in place, the card says the level and the
// next step, and the price it shows is exactly what the second tap takes from the wallet.

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  game().setPlanet(GUNS_AND_CHARGES_PLANET)
  game().giveMoney('1e12')
  game().teleportToDock('upgrade')
})

afterEach(() => uninstallRunLog())

/** Guns (#107) and charges (#109) are both offered here, so every gear row is drawn. */
const GUNS_AND_CHARGES_PLANET = 7

const game = () => useGameStore.getState()

function bayMarkup(): string {
  const focusedId = game().focusedControlId ?? ''
  return renderToString(createElement(UpgradeBayView, { model: readUpgradeBayModel(), focusedId }))
}

/** The text of the open (tapped) card, tags stripped. */
function openCardText(buyId: string): string {
  const html = bayMarkup()
  const start = html.indexOf(`data-testid="${buyId}"`)
  expect(start, `${buyId} is drawn as a card`).toBeGreaterThanOrEqual(0)
  const open = html.lastIndexOf('<', start)
  const next = html.indexOf('data-item-card=', start)
  const card = html.slice(open, next < 0 ? undefined : next)
  expect(card).toContain('aria-expanded="true"')
  return card.replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')
}

/** The exact price on the open card (`data-exact`, the kernel's price reading). */
function openCardPrice(buyId: string): string {
  const html = bayMarkup()
  const start = html.indexOf(`data-testid="${buyId}"`)
  const exact = /data-exact="([^"]+)"/.exec(html.slice(start))
  expect(exact, `${buyId} shows a price`).not.toBeNull()
  return exact![1]
}

/** The first tap on an entry: opens its card unless it is open already (the bay's start focus). */
function openCard(buyId: string): void {
  if (game().focusedControlId !== buyId) game().tapItemCard(buyId)
}

function wallet(): string {
  return toCanonical(readAuthorityState().players[game().playerId].wallet)
}

function gearBuys(): Record<string, ScreenButton> {
  const model = readUpgradeBayModel()
  expect(model.guns).not.toBeNull()
  expect(model.charges).not.toBeNull()
  return {
    casing: model.casing.buy,
    guns: model.guns!.buy,
    rack: model.charges!.rack.buy,
  }
}

describe('descriptions: the Upgrade bay rows as item cards', () => {
  it('opens a track’s card on the first tap with its level and next step, buying nothing', () => {
    const tip = readUpgradeBayModel().tracks[1]
    game().tapItemCard(tip.buy.id)
    const text = openCardText(tip.buy.id)
    expect(text).toContain('Level 0 → 0 · 1/9')
    expect(text).toMatch(/Drill tip [\d.,]+ → [\d.,]+/)
    expect(readUpgradeBayModel().tracks[1].level).toBe(0)
  })

  it('shows the level text and the next step on every gear card', () => {
    const buys = gearBuys()
    openCard(buys.casing.id)
    expect(openCardText(buys.casing.id)).toMatch(/Casing grade \d+ → \d+/)
    openCard(buys.guns.id)
    expect(openCardText(buys.guns.id)).toContain('Level 0 → 1')
    openCard(buys.rack.id)
    expect(openCardText(buys.rack.id)).toMatch(/Rack slots \d+ → \d+/)
  })

  it('takes exactly the price the open card shows on the second tap', () => {
    const trackBuys = readUpgradeBayModel().tracks.map((row) => row.buy)
    for (const { id: buyId } of [...trackBuys, ...Object.values(gearBuys())]) {
      openCard(buyId)
      const shown = openCardPrice(buyId)
      const before = wallet()
      game().tapItemCard(buyId)
      expect(toCanonical(sub(fromCanonical(before), fromCanonical(wallet()))), buyId).toBe(shown)
    }
  })
})
