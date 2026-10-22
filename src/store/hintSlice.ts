/**
 * The game store's hint slice (#16, #27): which hint and which transmission are up. The boards are
 * pure (`systems/hints`); this slice feeds them every batch of authority events the store follows
 * and hands the seen-set to the presentation slice, which keeps it in the local preferences file.
 * None of it is authority state, a command, a log line or part of the digest, so a run's digest
 * is the same with hints on and off.
 *
 * The boards watch from `startPlaques`, which the composition root calls once preferences, the
 * checkpoint and any launch scenario are settled. A scenario turns them off unless its file says
 * `hintsEnabled: true`, so scenario and bot runs never see a plaque.
 *
 * On a phone (#500) the compact HUD says whether the hint chip has room in the play view; while it
 * has none the board only queues, and a tap on the chip's dismiss takes the hint down for good.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import {
  dismissHintByTap,
  EMPTY_HINT_BOARD,
  observeHints,
  observeHintsQueuedOnly,
  queueHintFirstForDebug,
  queueShownHintForRoom,
  hintDefOf,
  type HintBoard,
  type HintStep,
} from '../systems/hints/hintBoard'
import type { HintMoment } from '../systems/hints/hintConditions'
import { HINT_TABLE } from '../systems/hints/hintTable'
import {
  dismissTransmission,
  EMPTY_TRANSMISSION_BOARD,
  observeTransmissions,
  type TransmissionBoard,
  type TransmissionStep,
} from '../systems/hints/transmissionBoard'
import type { Preferences } from '../systems/input/preferences'
import { isHintsEnabled, type Scenario } from '../systems/scenario'
import { getRunLog } from '../logging/runLog'
import { readAuthorityState } from './authorityLink'

export interface HintValues {
  hintBoard: HintBoard
  transmissionBoard: TransmissionBoard
  /** False once a scenario that does not turn hints on is applied (#16). */
  arePlaquesAllowed: boolean
  isWatchingPlaques: boolean
  /** The compact HUD has room for the hint chip (#500); always true on the full HUD. */
  hasHintRoom: boolean
}

export interface HintActions {
  /** The run has started: the boards watch from here, beginning with this first moment. */
  startPlaques(): void
  /** One batch of authority events, as the store follows them. */
  observePlaques(events: readonly DomainEvent[]): void
  /** Any key takes the transmission down (#16); the key still does what it is bound to. */
  dismissTransmission(): void
  /** A tap on the hint chip's dismiss (#500): the hint goes down and, already seen, stays down. */
  dismissHint(): void
  /** The compact HUD measured its room for the hint chip (#500); a lost room queues the hint. */
  noteHintRoom(hasRoom: boolean): void
  /**
   * Debug (the #500 layout specs): puts a hint of the table up next, with no gap to wait;
   * throws for an id the table does not have. Presentation only: no command, no log line.
   */
  debugShowHint(hintId: string): void
  allowPlaquesFor(scenario: Scenario): void
}

type SliceHost = HintValues &
  HintActions & {
    playerId: string
    planetTier: number
    depthTiles: number
    isDigGravityLimited: boolean
    prefs: Preferences
    rememberSeenHints(seenHints: readonly string[]): void
  }

type SetSlice = (partial: Partial<HintValues>) => void

export const STARTING_HINTS: HintValues = {
  hintBoard: EMPTY_HINT_BOARD,
  transmissionBoard: EMPTY_TRANSMISSION_BOARD,
  arePlaquesAllowed: true,
  isWatchingPlaques: false,
  hasHintRoom: true,
}

export function hintActionsOf(set: SetSlice, get: () => SliceHost): HintActions {
  return {
    startPlaques: () => {
      set({ isWatchingPlaques: true })
      get().observePlaques([])
    },
    observePlaques: (events) => {
      const host = get()
      if (!isWatchingPlaques(host)) return
      const moment: HintMoment = {
        state: readAuthorityState(),
        playerId: host.playerId,
        events,
        isDigGravityLimited: host.isDigGravityLimited,
      }
      const transmissions = observeTransmissions(transmissionStepOf(host), moment)
      const hints = observeShownHints(
        host,
        { ...hintStepOf(host), seen: transmissions.seen },
        moment,
      )
      keepBoards(set, host, hints, transmissions.board)
    },
    dismissTransmission: () => {
      const host = get()
      if (host.transmissionBoard.shown === null) return
      const step = dismissTransmission(transmissionStepOf(host))
      keepBoards(set, host, { ...hintStepOf(host), seen: step.seen }, step.board)
    },
    dismissHint: () => set({ hintBoard: dismissHintByTap(get().hintBoard) }),
    noteHintRoom: (hasRoom) => {
      const host = get()
      if (hasRoom === host.hasHintRoom) return
      set({ hasHintRoom: hasRoom, hintBoard: boardForRoom(host.hintBoard, hasRoom) })
      host.observePlaques([])
    },
    debugShowHint: (hintId) => {
      hintDefOf(HINT_TABLE, hintId)
      set({ hintBoard: queueHintFirstForDebug(get().hintBoard, hintId) })
      get().observePlaques([])
    },
    allowPlaquesFor: (scenario) => set({ arePlaquesAllowed: isHintsEnabled(scenario) }),
  }
}

/** A lost room sends the hint up back to the queue; a found one leaves the board to show it. */
function boardForRoom(board: HintBoard, hasRoom: boolean): HintBoard {
  return hasRoom ? board : queueShownHintForRoom(board)
}

/** From the run's start, and never in a scenario run that keeps hints off. */
function isWatchingPlaques(host: SliceHost): boolean {
  return host.isWatchingPlaques && host.arePlaquesAllowed
}

function hintStepOf(host: SliceHost): HintStep {
  return { board: host.hintBoard, seen: host.prefs.seenHints }
}

function transmissionStepOf(host: SliceHost): TransmissionStep {
  return { board: host.transmissionBoard, seen: host.prefs.seenHints }
}

/**
 * "Show hints" off: the hint board neither queues nor shows; transmissions still do. With no room
 * in the compact HUD (#500) it queues without showing.
 */
function observeShownHints(host: SliceHost, step: HintStep, moment: HintMoment): HintStep {
  if (!host.prefs.hintsEnabled) return step
  return host.hasHintRoom ? observeHints(step, moment) : observeHintsQueuedOnly(step, moment)
}

/** The boards are kept only when they changed, so a quiet tick never touches the store. */
function keepBoards(
  set: SetSlice,
  host: SliceHost,
  hints: HintStep,
  transmissionBoard: TransmissionBoard,
): void {
  if (hints.board !== host.hintBoard || transmissionBoard !== host.transmissionBoard) {
    set({ hintBoard: hints.board, transmissionBoard })
  }
  if (hints.seen !== host.prefs.seenHints) host.rememberSeenHints(hints.seen)
  recordHintShown(host, hints.board)
}

/** `hint_shown` once per hint, when it goes up (#58: the Upgrade bay hint is logged). */
function recordHintShown(host: SliceHost, board: HintBoard): void {
  const shown = board.shown
  if (shown === null || shown.id === host.hintBoard.shown?.id) return
  const place = { playerId: host.playerId, planet: host.planetTier, depthTiles: host.depthTiles }
  getRunLog().record({ ...place, tick: shown.shownTick }, 'hint_shown', { hintId: shown.id })
}
