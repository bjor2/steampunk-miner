/**
 * The game store's tap slice (spec #470 section 3, ticket 476): what a tap opened on a touch
 * screen, where no pointer hovers. A tap on an element's own text pins its brass tooltip open,
 * one at a time, until the same tap again; a tap on a shortened money readout opens a sheet
 * with the exact amount. UI state only: never a command, a log line or part of the digest.
 */
import { fromCanonical } from '../systems/money'

export interface TapSheetValues {
  /** The brass tooltip a tap pinned open; null while none is. */
  pinnedTooltipId: string | null
  /** The exact canonical amount behind the money readout a tap opened; null while it is closed. */
  shownExactAmount: string | null
}

export interface TapSheetActions {
  /** Pins this tooltip open, unpinning any other; the pinned one closes. */
  toggleTooltipPin(tooltipId: string): void
  /** Opens the exact-amount sheet; refused (thrown) for a text that is not a decimal amount. */
  showExactAmount(exact: string): void
  closeExactAmount(): void
}

type SetSlice = (partial: Partial<TapSheetValues>) => void

export const STARTING_TAP_SHEET: TapSheetValues = {
  pinnedTooltipId: null,
  shownExactAmount: null,
}

export function tapSheetActionsOf(set: SetSlice, get: () => TapSheetValues): TapSheetActions {
  return {
    toggleTooltipPin: (tooltipId) =>
      set({ pinnedTooltipId: get().pinnedTooltipId === tooltipId ? null : tooltipId }),
    showExactAmount: (exact) => {
      fromCanonical(exact)
      set({ shownExactAmount: exact })
    },
    closeExactAmount: () => set({ shownExactAmount: null }),
  }
}
