/**
 * The sensing slice's UI state (feature-slices.md 6.4): one client's reveal board and passive
 * reads. It hears the authority's events through `listenForDomainEvents` and is advanced once a
 * frame with the authority tick by the reveal layer; it never writes the game store, the authority
 * or the log, so nothing a sensing item shows can change state or a digest (#203 acceptance 1).
 * The layer reads the board with `getState` each frame; the panels select the passives, which
 * change only when what they read changes.
 */
import { create } from 'zustand'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { boardAfterHeard } from '../systems/revealBoard'
import { EMPTY_SENSING_VIEW, sensingViewAt, type SensingView } from '../systems/sensingView'

interface SensingState extends SensingView {
  /** A `listenForDomainEvents` listener: the batch's uses and the local player's dock. */
  hearSensingEvents(events: readonly DomainEvent[], playerId: string): void
  /** The frame's authority tick: run-out pings go, buoy rings re-ping, the passives read. */
  advanceSensingTo(tick: number): void
}

export const useSensingStore = create<SensingState>()((set, get) => ({
  ...EMPTY_SENSING_VIEW,
  hearSensingEvents: (events, playerId) => {
    const board = boardAfterHeard(get().board, events, readAuthorityState(), playerId)
    if (board !== get().board) set({ board })
  },
  advanceSensingTo: (tick) => {
    const now = get()
    const next = sensingViewAt(now, readAuthorityState(), useGameStore.getState().playerId, tick)
    if (next !== now) set(next)
  },
}))

/** For specs' `beforeEach`. */
export function resetSensingStore(): void {
  useSensingStore.setState(EMPTY_SENSING_VIEW)
}
