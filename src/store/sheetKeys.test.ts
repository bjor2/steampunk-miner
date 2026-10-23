import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { DESIGN_TOKENS } from '../systems/views/designSystem'
import { shownSheetTabsOn, type SheetTab } from '../ui/registries/sheetTabs'
import { readAuthorityState } from './authorityLink'
import { resetGameStore, useGameStore } from './gameStore'
import { readActionStream, resetInput, routeKeyChange } from './inputRuntime'
import { sheetTabShownOf } from './sheetSlice'

// The desktop sheet keys (spec #678, ticket 768): Tab opens the base sheet on its first shown tab
// and shuts it, and O, P, H, L and G jump to the tab that bears their place's word.

const game = () => useGameStore.getState()

/** One key going down and coming up, as the shell sends it. */
function tapKey(code: string): void {
  routeKeyChange({ code, isDown: true, isRepeat: false, isShiftHeld: false })
  routeKeyChange({ code, isDown: false, isRepeat: false, isShiftHeld: false })
}

const placeTab = (id: string, title: string, order: number): SheetTab => ({
  id,
  title,
  order,
  isShownOn: () => true,
  Panel: () => createElement('span', null, id),
})

/** A slice whose tabs bear the Patent Office's and the Gearbox's words, as a real one would. */
const PLACES_PROBE: SliceDefinition = {
  id: 'sheet-keys-probe',
  register: (r) => {
    r.sheetTab(placeTab('sheet-keys-probe.patents', DESIGN_TOKENS.copy.places.patentOffice, 20))
    r.sheetTab(placeTab('sheet-keys-probe.gears', DESIGN_TOKENS.copy.places.gearbox, 50))
  },
}

/** The pause save page's slot list settles after the checkpoint reads it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  resetGameStore()
  resetInput()
})

describe('sheet keys', () => {
  it('opens the sheet on its first shown tab with Tab while driving, and shuts it with Tab', () => {
    const [first] = shownSheetTabsOn(readAuthorityState(), game().playerId)
    tapKey('Tab')
    expect(sheetTabShownOf(game())).toBe(first.id)
    tapKey('Tab')
    expect(sheetTabShownOf(game())).toBeNull()
  })

  it('jumps to the Hold with H from driving, and from one tab to another on an open sheet', () => {
    withRegistrations([PLACES_PROBE], () => {
      tapKey('KeyH')
      expect(sheetTabShownOf(game())).toBe('hold')
      tapKey('KeyP')
      expect(sheetTabShownOf(game())).toBe('sheet-keys-probe.patents')
    })
  })

  it('opens the Ledger with L, which holds the world on the pause save page', async () => {
    tapKey('KeyL')
    await settle()
    expect(game().pauseMenu?.page).toBe('save')
    expect(sheetTabShownOf(game())).toBe('ledger')
  })

  it('leaves the Ledger for the Hold with H, and shuts the Ledger with Tab', async () => {
    tapKey('KeyL')
    await settle()
    tapKey('KeyH')
    expect(game().pauseMenu).toBeNull()
    expect(sheetTabShownOf(game())).toBe('hold')
    tapKey('KeyL')
    await settle()
    tapKey('Tab')
    expect(game().pauseMenu?.page).toBe('main')
    expect(sheetTabShownOf(game())).toBeNull()
  })

  it('does nothing for a place no shown tab bears, such as the Outfitter away from its bay', () => {
    tapKey('KeyO')
    expect(sheetTabShownOf(game())).toBeNull()
  })

  it('keeps G on the guns while driving, and jumps to the Gearbox with it on the sheet', () => {
    withRegistrations([PLACES_PROBE], () => {
      tapKey('KeyG')
      expect(sheetTabShownOf(game())).toBeNull()
      expect(readActionStream().map((edge) => edge.actionId)).toEqual(['toggle_guns'])
      tapKey('Tab')
      tapKey('KeyG')
      expect(sheetTabShownOf(game())).toBe('sheet-keys-probe.gears')
    })
  })

  it("opens no sheet over the pause menu's first page", () => {
    game().openPauseMenu()
    tapKey('Tab')
    tapKey('KeyH')
    expect(game().pauseMenu?.page).toBe('main')
    expect(sheetTabShownOf(game())).toBeNull()
  })

  it('takes Tab from the browser where it opens the sheet, and leaves it to a bay screen', () => {
    const tabDown = { code: 'Tab', isDown: true, isRepeat: false, isShiftHeld: false }
    expect(routeKeyChange(tabDown)).toBe(true)
    game().closeSheet()
    game().teleportToDock('sell')
    expect(routeKeyChange({ ...tabDown, code: 'Tab' })).toBe(false)
  })

  it('closes whatever the keys opened with Escape', () => {
    tapKey('KeyH')
    tapKey('Escape')
    expect(sheetTabShownOf(game())).toBeNull()
    expect(game().pauseMenu).toBeNull()
  })
})
