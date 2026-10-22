import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { KERNEL_SHEET_TAB_IDS } from '../systems/views/kernelSheetTabIds'
import { resetGameStore, useGameStore } from './gameStore'
import { pressAction, releaseAction, resetInput } from './inputRuntime'
import { inputLayerOf } from './presentationSlice'
import { readDockedBay } from './screenReads'

// The sheet a dock opens is that bay's one menu (ticket 734): docking at the Upgrade bay opened
// the Outfitter over the bay's frame, so one open stacked two menus and play came back only on the
// second close. Now one close, Escape or the sheet's Close, shuts the sheet and leaves the bay. A
// sheet the player opens from a bay's button is a second layer they asked for, and closes back.

/** The workshop slice's tab (`workshop/ui/outfitterTab.ts`), registered by the loaded slices. */
const OUTFITTER_TAB_ID = 'workshop.outfitter'

const game = () => useGameStore.getState()

function tap(action: 'ui_cancel'): void {
  pressAction(action)
  releaseAction(action)
}

/** What `useOutfitterWhileDocked` does as the Upgrade bay's showcase mounts with the dock. */
function dockAtTheUpgradeBay(): void {
  game().teleportToDock('upgrade')
  game().openSheetAsBayMenu(OUTFITTER_TAB_ID)
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  resetInput()
})

afterEach(() => uninstallRunLog())

describe('bay menu sheet', () => {
  it('opens one menu on a dock at the Upgrade bay: the sheet takes input over the bay', () => {
    dockAtTheUpgradeBay()
    expect(game().openSheetTabId).toBe(OUTFITTER_TAB_ID)
    expect(game().isSheetTheBayMenu).toBe(true)
    expect(inputLayerOf(game())).toBe('sheet')
  })

  it('returns to play on one Escape, shutting the sheet and leaving the bay', () => {
    dockAtTheUpgradeBay()
    tap('ui_cancel')
    expect(game().openSheetTabId).toBeNull()
    expect(readDockedBay()).toBeNull()
    expect(inputLayerOf(game())).toBe('vehicle')
  })

  it('returns to play on one press of the sheet’s Close', () => {
    dockAtTheUpgradeBay()
    game().closeSheet()
    expect(game().openSheetTabId).toBeNull()
    expect(readDockedBay()).toBeNull()
    expect(game().vehicle.mode).not.toBe('docked')
  })

  it('stays the bay’s menu on another tab, so its close still leaves the bay', () => {
    dockAtTheUpgradeBay()
    game().openSheet(KERNEL_SHEET_TAB_IDS.hold)
    game().closeSheet()
    expect(readDockedBay()).toBeNull()
  })

  it('shuts with the dock when the rig leaves by the bay’s Undock, sending nothing more', () => {
    dockAtTheUpgradeBay()
    game().undock()
    game().shutBayMenuSheet()
    expect(game().openSheetTabId).toBeNull()
    expect(game().isSheetTheBayMenu).toBe(false)
    expect(readDockedBay()).toBeNull()
  })

  it('closes a sheet opened from a bay’s button back to that bay', () => {
    game().teleportToDock('sell')
    game().openSheet(KERNEL_SHEET_TAB_IDS.hold)
    tap('ui_cancel')
    expect(game().openSheetTabId).toBeNull()
    expect(readDockedBay()).toBe('sell')
    expect(inputLayerOf(game())).toBe('platform')
  })

  it('leaves a sheet the player opened alone when a bay’s dock ends', () => {
    game().teleportToDock('sell')
    game().openSheet(KERNEL_SHEET_TAB_IDS.hold)
    game().shutBayMenuSheet()
    expect(game().openSheetTabId).toBe(KERNEL_SHEET_TAB_IDS.hold)
  })
})
