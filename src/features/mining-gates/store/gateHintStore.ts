/**
 * The gate hints' own UI state (ticket 238; feature-slices.md 6.4): the HUD chip's board and what
 * the gate sounds last played, fed by the authority's events through `listenForDomainEvents` and
 * aged by the authority tick. Presentation only: it never writes the game store, submits a
 * command or touches the digest; a sound goes to the kernel through `requestSoundCue`.
 */
import { create } from 'zustand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { requestSoundCue } from '../../../store/soundCueRequests'
import {
  EMPTY_GATE_CHIP_BOARD,
  withoutEndedChip,
  type GateChipBoard,
} from '../systems/gateChipBoard'
import { boardAfterEvents, gateHitsOf, hasClearedGate } from '../systems/gateHintFeed'
import {
  gateSoundPlanOf,
  QUIET_GATE_SOUND_MEMORY,
  type GateSoundMemory,
} from '../systems/render/gateSounds'

interface GateHintValues {
  board: GateChipBoard
  soundMemory: GateSoundMemory
  /** The latest authority tick the board was shown at. */
  tick: number
}

interface GateHintState extends GateHintValues {
  /** One batch of authority events: the local player's gate stops show a chip and sound. */
  observeGateEvents(events: readonly DomainEvent[], playerId: string): void
  /** Ages the board to the authority's tick, so the chip clears with no new event. */
  showAt(tick: number): void
}

const STARTING_VALUES: GateHintValues = {
  board: EMPTY_GATE_CHIP_BOARD,
  soundMemory: QUIET_GATE_SOUND_MEMORY,
  tick: 0,
}

export const useGateHintStore = create<GateHintState>()((set, get) => ({
  ...STARTING_VALUES,
  observeGateEvents: (events, playerId) => {
    const sounds = gateSoundPlanOf(
      gateHitsOf(events, playerId),
      hasClearedGate(events, playerId),
      get().soundMemory,
    )
    sounds.cueIds.forEach((cueId) => requestSoundCue(cueId))
    set({
      board: boardAfterEvents(get().board, events, playerId),
      soundMemory: sounds.memory,
      tick: latestTickOf(get().tick, events),
    })
  },
  showAt: (tick) => set({ board: withoutEndedChip(get().board, tick), tick }),
}))

/** For specs' `beforeEach`. */
export function resetGateHintStore(): void {
  useGateHintStore.setState(STARTING_VALUES)
}

function latestTickOf(shownTick: number, events: readonly DomainEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.tick), shownTick)
}
