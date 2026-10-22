/**
 * The game store's dig ramp slice (Bjor's ruling on #724): whether the cut down's speed is held by
 * the gravity ramp this physics step, as the client's motion rule says. The HUD tints the tile
 * readout while it holds (`tileTime.ts`), and the first time it does the hint board shows its one
 * plaque (`hint_gravity_ramp`). Written only when it changes, so a step that keeps it never touches
 * the store. Client presentation only: never a command, a log line or part of the digest.
 */

export interface DigRampValues {
  isDigGravityLimited: boolean
}

export interface DigRampActions {
  /** The motion step's answer; a change shows on the HUD, and its first hold queues the hint. */
  noteDigGravityLimit(isLimited: boolean): void
}

interface SliceHost extends DigRampValues {
  observePlaques(events: readonly []): void
}

type SetSlice = (partial: Partial<DigRampValues>) => void

export const STARTING_DIG_RAMP: DigRampValues = { isDigGravityLimited: false }

export function digRampActionsOf(set: SetSlice, get: () => SliceHost): DigRampActions {
  return {
    noteDigGravityLimit: (isLimited) => {
      if (isLimited === get().isDigGravityLimited) return
      set({ isDigGravityLimited: isLimited })
      if (isLimited) get().observePlaques([])
    },
  }
}
