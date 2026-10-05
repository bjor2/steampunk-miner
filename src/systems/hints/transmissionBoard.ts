/**
 * The three text transmissions of the slice (#2 narrative stubs, #17 scope review): the opening,
 * the core reached and the arrival at planet 2, each shown once on its `shownWhen`, in the hints'
 * plaque style, never pausing the game and taken down by any key (#16). They share the hints'
 * seen-set but not their 20 s spacing or the "Show hints" switch: they are story, not help.
 */
import { HINT_CONDITIONS, type HintMoment } from './hintConditions'
import { HINT_TABLE, type HintTable } from './hintTable'

export interface TransmissionBoard {
  queued: readonly string[]
  shown: string | null
}

export interface TransmissionStep {
  board: TransmissionBoard
  seen: readonly string[]
}

export const EMPTY_TRANSMISSION_BOARD: TransmissionBoard = { queued: [], shown: null }

export function observeTransmissions(
  step: TransmissionStep,
  moment: HintMoment,
  table: HintTable = HINT_TABLE,
): TransmissionStep {
  return showNextTransmission(queueTriggeredTransmissions(step, moment, table))
}

/** Any key takes the shown transmission down; the next one waiting goes up. */
export function dismissTransmission(step: TransmissionStep): TransmissionStep {
  return showNextTransmission({ ...step, board: { ...step.board, shown: null } })
}

function queueTriggeredTransmissions(
  step: TransmissionStep,
  moment: HintMoment,
  table: HintTable,
): TransmissionStep {
  const triggered = table.transmissions
    .filter((entry) => !step.seen.includes(entry.id) && !step.board.queued.includes(entry.id))
    .filter((entry) => HINT_CONDITIONS[entry.shownWhen](moment))
    .map((entry) => entry.id)
  if (triggered.length === 0) return step
  return { ...step, board: { ...step.board, queued: [...step.board.queued, ...triggered] } }
}

function showNextTransmission(step: TransmissionStep): TransmissionStep {
  const [next, ...rest] = step.board.queued
  if (next === undefined || step.board.shown !== null) return step
  return { board: { queued: rest, shown: next }, seen: [...step.seen, next] }
}
