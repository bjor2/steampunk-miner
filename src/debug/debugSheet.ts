/**
 * The debug reads and switches of the base sheet (spec #678, ticket 686): open it on a registered
 * tab, close it, and read what it shows, so the screenshot suite and the sheet spec drive it the way
 * a tab opener will. Presentation only: no command, no log line, nothing a save or the digest sees.
 */
import { readShownSheetTabIds } from '../store/screenReads'
import { useGameStore } from '../store/gameStore'
import { sheetTabShownOf } from '../store/sheetSlice'
import { layoutKindOf } from '../systems/views/designSystem'
import { sheetPlacementOf, type SheetPlacement } from '../systems/views/sheetLayout'
import { sheetTabIdProblems } from '../ui/registries/sheetTabs'
import { readFittedScreen } from '../ui/stage/screenFit'
import type { DebugResult } from './debugScreens'

export interface SheetReading {
  /** The tab the sheet shows: the open one, or the Ledger on the pause save page (ticket 688). */
  openTabId: string | null
  /** Every tab the bar shows now, in order. */
  shownTabIds: string[]
  /** Where the sheet sits on this screen; null before the first fit. */
  placement: SheetPlacement | null
  revealedCardId: string | null
}

export function openSheetUnlessRefused(tabId: unknown): DebugResult {
  const problems = sheetTabIdProblems(tabId)
  if (problems.length > 0) return { ok: false, problems }
  useGameStore.getState().openSheet(tabId)
  return { ok: true }
}

export function closeSheetNow(): DebugResult {
  useGameStore.getState().closeSheet()
  return { ok: true }
}

export function sheetNow(): DebugResult<{ sheet: SheetReading }> {
  const game = useGameStore.getState()
  return {
    ok: true,
    sheet: {
      openTabId: sheetTabShownOf(game),
      shownTabIds: readShownSheetTabIds(),
      placement: placementNow(),
      revealedCardId: game.revealedSheetCardId,
    },
  }
}

function placementNow(): SheetPlacement | null {
  const fitted = readFittedScreen()
  if (fitted === null) return null
  return sheetPlacementOf(layoutKindOf(fitted.hudDensity), fitted.stage.width)
}
