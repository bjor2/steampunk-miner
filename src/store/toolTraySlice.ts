/**
 * The game store's tool tray slice (spec #678, tickets 691 and 768): the page of the tool slot
 * bar's overflow tray that the cells show, 0 for the thumb cells. The bar draws it and the number
 * keys follow it (the HS on the GD lock of 23 Oct: hotkeys apply to the current page), so it lives
 * here rather than in the bar. UI state only: never a command, a log line or part of the digest.
 */

export interface ToolTrayValues {
  toolTrayPage: number
}

export interface ToolTrayActions {
  /** The overflow cell's turn: the cells show tray page `page`, 0 for the thumb cells. */
  turnToolTray(page: number): void
}

type SetSlice = (partial: Partial<ToolTrayValues>) => void

export const STARTING_TOOL_TRAY: ToolTrayValues = { toolTrayPage: 0 }

export function toolTrayActionsOf(set: SetSlice): ToolTrayActions {
  return {
    turnToolTray: (page) => set({ toolTrayPage: page }),
  }
}
