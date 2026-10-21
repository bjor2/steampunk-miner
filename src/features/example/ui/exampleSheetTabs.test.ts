import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../../store/gameStore'
import { readShownSheetTabIds } from '../../../store/screenReads'
import { exampleDebugActions } from '../debug'
import { hideSheetProbeTabs } from '../store/sheetProbeStore'
import { EXAMPLE_CARDS_TAB_ID, EXAMPLE_LEDGER_TAB_ID } from './ExampleSheetTabs'

// Ticket 686: the example's base-sheet tabs are a kernel e2e probe, off the bar until the debug
// action shows them, so a player never sees them once a tab opener lands (#687, #688).

beforeEach(() => resetGameStore())

afterEach(() => hideSheetProbeTabs())

describe('example sheet tabs', () => {
  it('stays off the base sheet until the debug action shows it', () => {
    expect(readShownSheetTabIds()).not.toContain(EXAMPLE_CARDS_TAB_ID)
    exampleDebugActions.showSheetTabs()
    expect(readShownSheetTabIds()).toEqual(
      expect.arrayContaining([EXAMPLE_CARDS_TAB_ID, EXAMPLE_LEDGER_TAB_ID]),
    )
  })

  it('reports no acted card before any card acted', () => {
    exampleDebugActions.showSheetTabs()
    expect(exampleDebugActions.getActedCard()).toEqual({ ok: true, cardId: null })
  })
})
