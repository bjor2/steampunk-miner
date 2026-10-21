/**
 * The game store's sheet slice (spec #678, ticket 686): which tab of the one base sheet is open and
 * which card on it shows its line after a finger's first tap. The sheet's tabs are registered data
 * (`ui/registries/sheetTabs.ts`); Escape or the sheet's Close shuts it. UI state only: never a
 * command, a log line or part of the digest.
 */
import {
  cardPressOf,
  revealedCardAfter,
  type CardPress,
  type CardPresser,
} from '../systems/views/cardReveal'
import { sheetTabIdProblems } from '../ui/registries/sheetTabs'
import { refuseProblems } from './authorityLink'

export interface SheetValues {
  /** The base sheet's tab while the sheet is open; null while it is shut. */
  openSheetTabId: string | null
  /** The card whose line a tap revealed; null while none is. */
  revealedSheetCardId: string | null
}

export interface SheetActions {
  /** Opens the sheet on a registered tab, or moves an open sheet there; refused (thrown) for an unknown id. */
  openSheet(tabId: unknown): void
  /** Escape, or the sheet's Close button. */
  closeSheet(): void
  /**
   * A press on a card: a finger's first tap reveals its line, so the press answers `reveal`; the
   * second tap, a click or a key answers `act`, and the card runs its action.
   */
  pressSheetCard(cardId: string, presser: CardPresser): CardPress
}

type SetSlice = (partial: Partial<SheetValues>) => void

export const STARTING_SHEET: SheetValues = {
  openSheetTabId: null,
  revealedSheetCardId: null,
}

export function sheetActionsOf(set: SetSlice, get: () => SheetValues): SheetActions {
  return {
    openSheet: (tabId) => {
      refuseProblems(sheetTabIdProblems(tabId))
      set({ openSheetTabId: tabId as string, revealedSheetCardId: null })
    },
    closeSheet: () => set(STARTING_SHEET),
    pressSheetCard: (cardId, presser) => {
      const press = cardPressOf(get().revealedSheetCardId, cardId, presser)
      set({ revealedSheetCardId: revealedCardAfter(get().revealedSheetCardId, cardId, press) })
      return press
    },
  }
}
