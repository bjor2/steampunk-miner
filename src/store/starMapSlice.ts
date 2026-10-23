/**
 * The game store's star map slice (spec #678, ticket 769; #650's map UX: one key on desktop): whether
 * the star map's panel is open. M or a click on the strip's fuel wells opens it, M again, its Close
 * or Escape shuts it. On desktop it docks beside the view as the sheet does, and the game keeps
 * running behind it; the map itself (#757) draws inside it. UI state only: never a command, a log
 * line or part of the digest.
 */

export interface StarMapValues {
  isStarMapOpen: boolean
}

export interface StarMapPanelActions {
  /** M, or a click on the strip's fuel wells: opens the star map, or shuts it while open. */
  toggleStarMap(): void
  /** The panel's Close, or Escape while it is open. */
  closeStarMap(): void
}

type SetSlice = (partial: Partial<StarMapValues>) => void

export const STARTING_STAR_MAP: StarMapValues = { isStarMapOpen: false }

export function starMapPanelActionsOf(
  set: SetSlice,
  get: () => StarMapValues,
): StarMapPanelActions {
  return {
    toggleStarMap: () => set({ isStarMapOpen: !get().isStarMapOpen }),
    closeStarMap: () => set(STARTING_STAR_MAP),
  }
}
