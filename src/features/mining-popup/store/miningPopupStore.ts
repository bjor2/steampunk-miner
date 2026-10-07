/**
 * The popup's own UI state (feature-slices.md 6.4): the chip board and the plaque board, fed by the
 * authority's events through `listenForDomainEvents`, aged by the authority tick. Presentation only:
 * it never writes the game store, submits a command or touches the digest (#178: the codex owns
 * discovery, the popup only renders it).
 */
import { create } from 'zustand'
import { readAuthorityState } from '../../../store/authorityLink'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  addPickupToChips,
  EMPTY_CHIP_BOARD,
  withoutEndedChips,
  type ChipBoard,
  type OrePickup,
} from '../systems/chipBoard'
import { materialMomentsOf, pickupsOf, type MaterialMoment } from '../systems/miningMoments'
import { addDiscoveryToPlaque, EMPTY_PLAQUE_BOARD, type PlaqueBoard } from '../systems/plaqueBoard'

interface MiningPopupValues {
  chipBoard: ChipBoard
  plaqueBoard: PlaqueBoard
  /** The latest authority tick the boards were shown at. */
  tick: number
}

interface MiningPopupState extends MiningPopupValues {
  /** One batch of authority events: the local player's units into the hold become chips. */
  observePickups(events: readonly DomainEvent[], playerId: string): void
  /** One batch of authority events: the local player's first mines become plaque lines. */
  observeDiscoveries(events: readonly DomainEvent[], playerId: string): void
  /** Ages the boards to the authority's tick, so a chip or plaque clears with no new event. */
  showAt(tick: number): void
}

const STARTING_VALUES: MiningPopupValues = {
  chipBoard: EMPTY_CHIP_BOARD,
  plaqueBoard: EMPTY_PLAQUE_BOARD,
  tick: 0,
}

export const useMiningPopupStore = create<MiningPopupState>()((set, get) => ({
  ...STARTING_VALUES,
  observePickups: (events, playerId) => {
    const pickups = pickupsOf(events, readAuthorityState(), playerId)
    if (pickups.length === 0) return
    set({
      chipBoard: pickups.reduce(addPickupToChips, get().chipBoard),
      tick: latestTickOf(get().tick, pickups),
    })
  },
  observeDiscoveries: (events, playerId) => {
    const moments = materialMomentsOf(events, readAuthorityState(), playerId)
    if (moments.length === 0) return
    set({
      plaqueBoard: moments.reduce(addMoment, get().plaqueBoard),
      tick: latestTickOf(get().tick, moments),
    })
  },
  showAt: (tick) => set({ chipBoard: withoutEndedChips(get().chipBoard, tick), tick }),
}))

/** For specs' `beforeEach`. */
export function resetMiningPopupStore(): void {
  useMiningPopupStore.setState(STARTING_VALUES)
}

function addMoment(board: PlaqueBoard, { material, tick }: MaterialMoment): PlaqueBoard {
  return addDiscoveryToPlaque(board, material, tick)
}

function latestTickOf(shownTick: number, moments: readonly (OrePickup | MaterialMoment)[]) {
  return Math.max(shownTick, moments[moments.length - 1].tick)
}
