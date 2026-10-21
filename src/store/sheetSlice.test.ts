import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { createScriptedSession } from '../systems/authority/scriptedSession'
import { shownSheetTabsOn, type SheetTab } from '../ui/registries/sheetTabs'
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
    expect(ids).toEqual(['sheet-probe.outfitter', 'sheet-probe.hold'])
  })

  it('leaves a tab off the bar while it says it is not shown', () => {
    const hidden = sliceWith(tabOf('sheet-probe.hold', 1, { isShownOn: () => false }))
    const state = createScriptedSession().state()
    expect(withRegistrations([hidden], () => shownSheetTabsOn(state, 'p1'))).toEqual([])
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
