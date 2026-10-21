/**
 * The game store's HUD detail slice (spec #678, ticket 684): whether the strip's detail is open,
 * the plate behind the gear button that holds every exact value and word the strip leaves out.
 * A press on the gear opens it and the next closes it. UI state only: never a command, a log line
 * or part of the digest, and it does not hold play.
 */

export interface HudDetailValues {
  isHudDetailOpen: boolean
}

export interface HudDetailActions {
  toggleHudDetail(): void
  closeHudDetail(): void
}

type SetSlice = (partial: Partial<HudDetailValues>) => void

export const STARTING_HUD_DETAIL: HudDetailValues = { isHudDetailOpen: false }

export function hudDetailActionsOf(set: SetSlice, get: () => HudDetailValues): HudDetailActions {
  return {
    toggleHudDetail: () => set({ isHudDetailOpen: !get().isHudDetailOpen }),
    closeHudDetail: () => set({ isHudDetailOpen: false }),
  }
}
