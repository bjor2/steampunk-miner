import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { fromCanonical, sub, toCanonical } from '../systems/money'
import { readAuthorityState } from './authorityLink'
import { resetGameStore, useGameStore } from './gameStore'
import { outfitterCardsOf } from '../systems/views/outfitterCards'
import { readUpgradeBayModel } from './screenReads'

// The Outfitter's cards on the sheet (ticket 687): with the sheet open over the dock, a card's act
// presses the bay's own button, so it buys exactly once and takes exactly the price the bay model
// reads; the pad's menu keys walk and confirm the same buttons.

/** The workshop slice's tab (`workshop/ui/outfitterTab.ts`), registered by the loaded slices. */
const OUTFITTER_TAB_ID = 'workshop.outfitter'

const game = () => useGameStore.getState()

function wallet(): string {
  return toCanonical(readAuthorityState().players[game().playerId].wallet)
}

function cardOf(id: string) {
  const card = outfitterCardsOf(readUpgradeBayModel()).find((entry) => entry.id === id)
  if (card === undefined || card.buttonId === null) throw new Error(`no card ${id} to press`)
  return card
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  game().giveMoney('1e12')
  game().teleportToDock('upgrade')
  game().openSheet(OUTFITTER_TAB_ID)
})

afterEach(() => uninstallRunLog())

describe('outfitter press', () => {
  it('buys one drill power level and takes exactly the bay’s price', () => {
    const drill = readUpgradeBayModel().tracks.find((row) => row.upgradeId === 'drill_power')!
    const before = wallet()
    game().pressScreenButton(cardOf('upgrade-bay.card.track.drill_power').buttonId!)
    const spent = sub(fromCanonical(before), fromCanonical(wallet()))
    expect(toCanonical(spent)).toBe(drill.cost.exact)
    expect(readAuthorityState().players[game().playerId].vehicle.levels.drill_power).toBe(
      drill.level + 1,
    )
  })

  it('walks the bay’s buttons with the menu keys and buys the focused one on confirm', () => {
    const drill = readUpgradeBayModel().tracks.find((row) => row.upgradeId === 'drill_tip')!
    game().moveFocus(1)
    expect(game().focusedControlId).toBe(drill.buy.id)
    game().activateFocusedControl()
    expect(readAuthorityState().players[game().playerId].vehicle.levels.drill_tip).toBe(
      drill.level + 1,
    )
  })

  it('buys nothing on a card the wallet is short for', () => {
    resetGameStore()
    game().teleportToDock('upgrade')
    game().openSheet(OUTFITTER_TAB_ID)
    const card = outfitterCardsOf(readUpgradeBayModel()).find(
      (entry) => entry.isMuted && entry.buttonId !== null,
    )!
    const before = wallet()
    expect(game().pressScreenButton(card.buttonId!)).toBe(false)
    expect(wallet()).toBe(before)
  })
})
