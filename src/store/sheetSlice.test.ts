import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { createScriptedSession } from '../systems/authority/scriptedSession'
import { KERNEL_SHEET_TABS, shownSheetTabsOn, type SheetTab } from '../ui/registries/sheetTabs'
import { sheetTabDrawnAt, sheetTabShownOf } from './sheetSlice'
import { resetGameStore, useGameStore } from './gameStore'

// The base sheet (spec #678, ticket 686): tabs are registered data, the store holds the open tab
// and the card a finger's first tap revealed; opening, switching and closing are UI state only.

const game = () => useGameStore.getState()

const tabOf = (id: string, order: number, overrides: Partial<SheetTab> = {}): SheetTab => ({
  id,
  title: 'Probe Tab',
  order,
  isShownOn: () => true,
  Panel: () => createElement('span', null, id),
  ...overrides,
})

const sliceWith = (...tabs: SheetTab[]): SliceDefinition => ({
  id: 'sheet-probe',
  register: (r) => tabs.forEach((tab) => r.sheetTab(tab)),
})

const PROBE = sliceWith(tabOf('sheet-probe.hold', 2), tabOf('sheet-probe.outfitter', 1))

beforeEach(() => resetGameStore())

describe('sheet tabs', () => {
  it('lists the shown tabs in order, then by id', () => {
    const state = createScriptedSession().state()
    const ids = withRegistrations([PROBE], () => shownSheetTabsOn(state, 'p1').map((tab) => tab.id))
    expect(ids).toEqual(['sheet-probe.outfitter', 'sheet-probe.hold', 'hold', 'ledger'])
  })

  it('shows the kernel Hold and Ledger with no slice registered (ticket 688)', () => {
    const state = createScriptedSession().state()
    const ids = withRegistrations([], () => shownSheetTabsOn(state, 'p1').map((tab) => tab.id))
    expect(ids).toEqual(['hold', 'ledger'])
    expect(KERNEL_SHEET_TABS.map((tab) => tab.title)).toEqual(['Hold', 'Ledger'])
  })

  it('leaves a tab off the bar while it says it is not shown', () => {
    const hidden = sliceWith(tabOf('sheet-probe.hold', 1, { isShownOn: () => false }))
    const state = createScriptedSession().state()
    const ids = withRegistrations([hidden], () =>
      shownSheetTabsOn(state, 'p1').map((tab) => tab.id),
    )
    expect(ids).not.toContain('sheet-probe.hold')
  })

  it('refuses a tab title over the three-word budget at the seal', () => {
    const wordy = sliceWith(tabOf('sheet-probe.hold', 1, { title: 'The Hold Of Ore' }))
    expect(() => withRegistrations([wordy], () => undefined)).toThrow(/over 3 words/)
  })
})

describe('sheet', () => {
  it('starts shut, with no card revealed', () => {
    expect(game().openSheetTabId).toBeNull()
    expect(game().revealedSheetCardId).toBeNull()
  })

  it('opens on a registered tab and moves to another, then closes', () => {
    withRegistrations([PROBE], () => {
      game().openSheet('sheet-probe.hold')
      expect(game().openSheetTabId).toBe('sheet-probe.hold')
      game().openSheet('sheet-probe.outfitter')
      expect(game().openSheetTabId).toBe('sheet-probe.outfitter')
    })
    game().closeSheet()
    expect(game().openSheetTabId).toBeNull()
  })

  it('refuses a tab no slice registered and stays shut', () => {
    withRegistrations([PROBE], () => {
      expect(() => game().openSheet('sheet-probe.gone')).toThrow(/sheet-probe.gone/)
      expect(() => game().openSheet(7)).toThrow(/string/)
    })
    expect(game().openSheetTabId).toBeNull()
  })

  it("reveals a card's line on the first tap and acts on the second", () => {
    expect(game().pressSheetCard('sheet-probe.drill', 'touch')).toBe('reveal')
    expect(game().revealedSheetCardId).toBe('sheet-probe.drill')
    expect(game().pressSheetCard('sheet-probe.drill', 'touch')).toBe('act')
  })

  it('acts on the first click of a mouse', () => {
    expect(game().pressSheetCard('sheet-probe.drill', 'mouse')).toBe('act')
    expect(game().revealedSheetCardId).toBeNull()
  })

  it('forgets the revealed card when the tab changes or the sheet closes', () => {
    withRegistrations([PROBE], () => {
      game().openSheet('sheet-probe.hold')
      game().pressSheetCard('sheet-probe.drill', 'touch')
      game().openSheet('sheet-probe.outfitter')
      expect(game().revealedSheetCardId).toBeNull()
      game().pressSheetCard('sheet-probe.drill', 'touch')
    })
    game().closeSheet()
    expect(game().revealedSheetCardId).toBeNull()
  })

  it('changes nothing the authority holds: the wallet and the vehicle stay put', () => {
    const before = { money: game().money, vehicle: game().vehicle }
    withRegistrations([PROBE], () => game().openSheet('sheet-probe.hold'))
    game().pressSheetCard('sheet-probe.drill', 'touch')
    game().closeSheet()
    expect({ money: game().money, vehicle: game().vehicle }).toEqual(before)
  })
})

describe('sheet stepped aside (ticket 718)', () => {
  it('takes a full sheet out of the way and brings it back on the same tab', () => {
    withRegistrations([PROBE], () => game().openSheet('sheet-probe.outfitter'))
    game().stepSheetAside()
    expect(sheetTabDrawnAt(game(), 'full')).toBeNull()
    expect(game().openSheetTabId).toBe('sheet-probe.outfitter')
    game().bringSheetBack()
    expect(sheetTabDrawnAt(game(), 'full')).toBe('sheet-probe.outfitter')
  })

  it('leaves a docked sheet where it is, the car in view beside it', () => {
    withRegistrations([PROBE], () => game().openSheet('sheet-probe.outfitter'))
    game().stepSheetAside()
    expect(sheetTabDrawnAt(game(), 'docked')).toBe('sheet-probe.outfitter')
  })

  it('forgets the step aside once the sheet closes', () => {
    withRegistrations([PROBE], () => game().openSheet('sheet-probe.outfitter'))
    game().stepSheetAside()
    game().closeSheet()
    expect(game().isSheetSteppedAside).toBe(false)
  })
})

/** The pause save page's slot list settles after the checkpoint reads it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('ledger on the sheet (ticket 688)', () => {
  it('opens the pause menu on its save page when the Ledger is picked, so the world holds', async () => {
    game().openSheet('ledger')
    await settle()
    expect(game().pauseMenu?.page).toBe('save')
    expect(sheetTabShownOf(game())).toBe('ledger')
    expect(game().openSheetTabId).toBeNull()
  })

  it('shows the Ledger exactly while the pause menu is on its save page', async () => {
    game().openPauseMenu()
    expect(sheetTabShownOf(game())).toBeNull()
    await game().openSaveSlots()
    expect(sheetTabShownOf(game())).toBe('ledger')
    game().stepBackInPauseMenu()
    expect(game().pauseMenu?.page).toBe('main')
    expect(sheetTabShownOf(game())).toBeNull()
  })

  it("steps back to the pause menu's first page when the Ledger's Close is pressed", async () => {
    game().openPauseMenu()
    await game().openSaveSlots()
    game().closeSheet()
    expect(game().pauseMenu?.page).toBe('main')
    expect(sheetTabShownOf(game())).toBeNull()
  })

  it('leaves the pause menu, so the world runs again, when the Hold is picked from the Ledger', async () => {
    game().openPauseMenu()
    await game().openSaveSlots()
    game().openSheet('hold')
    expect(game().pauseMenu).toBeNull()
    expect(sheetTabShownOf(game())).toBe('hold')
  })

  it('closes the Ledger with the pause menu', async () => {
    game().openPauseMenu()
    await game().openSaveSlots()
    game().closePauseMenu()
    expect(sheetTabShownOf(game())).toBeNull()
  })
})

describe('hold on the sheet (ticket 688)', () => {
  it('opens the Hold from the Sell bay row button', () => {
    game().teleportToDock('sell')
    expect(game().pressScreenButton('sellbay-hold')).toBe(true)
    expect(game().openSheetTabId).toBe('hold')
  })

  it('puts the pad and the keys on the Hold cards, where a refused Sell changes nothing', () => {
    game().teleportToDock('sell')
    game().openSheet('hold')
    game().moveFocus(1)
    expect(game().focusedControlId).toBe('hold-sell-all')
    const money = game().money
    expect(game().pressScreenButton('hold-sell-all')).toBe(false)
    expect(game().money).toBe(money)
  })

  it('gives no menu focus on another tab of the sheet', () => {
    withRegistrations([PROBE], () => {
      game().openSheet('sheet-probe.hold')
      game().moveFocus(1)
      expect(game().focusedControlId || null).toBeNull()
    })
  })
})
