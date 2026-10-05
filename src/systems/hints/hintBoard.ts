/**
 * The onboarding hints as a pure board (#16, plus #58's `hint_upgrade_bay`): a hint is queued the first moment its
 * `shownWhen` holds, shown when nothing else is and the last hint went up at least
 * `minTicksBetweenHints` ago, and taken down the first moment its `dismissedWhen` holds while it
 * is up. Each is shown once: a shown id joins the seen-set, which the store keeps in the local
 * preferences file, never in the save, the digest or the replay. Time is the authority's tick,
 * so the board pauses with the game and never pauses it.
 *
 * Dismissal is judged only while a hint is up: a hint queued behind the 20 s gap still goes up
 * once, even if the player has already done the thing (the run's first moments come fast).
 */
import { HINT_CONDITIONS, rescueCostIn, type HintMoment, type RescueCost } from './hintConditions'
import { HINT_TABLE, type HintDef, type HintTable } from './hintTable'

export interface QueuedHint {
  id: string
  /** The last tow's cost while the hint waited or showed; null before any tow. */
  rescueCost: RescueCost | null
}

export interface ShownHint extends QueuedHint {
  shownTick: number
}

export interface HintBoard {
  queued: readonly QueuedHint[]
  shown: ShownHint | null
  lastShownTick: number | null
}

/** A board and the seen-set it moves together with. */
export interface HintStep {
  board: HintBoard
  seen: readonly string[]
}

export const EMPTY_HINT_BOARD: HintBoard = { queued: [], shown: null, lastShownTick: null }

export function observeHints(
  step: HintStep,
  moment: HintMoment,
  table: HintTable = HINT_TABLE,
): HintStep {
  const dismissed = dismissShownHint(step, moment, table)
  const queued = queueTriggeredHints(dismissed, moment, table)
  const costed = noteRescueCost(queued, rescueCostIn(moment))
  return showNextHint(costed, moment.state.tick, table)
}

export function isHintShown(board: HintBoard, id: string): boolean {
  return board.shown?.id === id
}

function dismissShownHint(step: HintStep, moment: HintMoment, table: HintTable): HintStep {
  const { shown } = step.board
  if (shown === null) return step
  if (!HINT_CONDITIONS[hintDefOf(table, shown.id).dismissedWhen](moment)) return step
  return { ...step, board: { ...step.board, shown: null } }
}

function queueTriggeredHints(step: HintStep, moment: HintMoment, table: HintTable): HintStep {
  const triggered = table.hints
    .filter((hint) => !isHintKnown(step, hint.id))
    .filter((hint) => HINT_CONDITIONS[hint.shownWhen](moment))
    .map((hint): QueuedHint => ({ id: hint.id, rescueCost: null }))
  if (triggered.length === 0) return step
  return { ...step, board: { ...step.board, queued: [...step.board.queued, ...triggered] } }
}

/** Seen, waiting or up: a hint is never queued twice. */
function isHintKnown(step: HintStep, id: string): boolean {
  return step.seen.includes(id) || step.board.queued.some((hint) => hint.id === id)
}

function noteRescueCost(step: HintStep, rescueCost: RescueCost | null): HintStep {
  if (rescueCost === null) return step
  const { queued, shown } = step.board
  return {
    ...step,
    board: {
      ...step.board,
      queued: queued.map((hint) => ({ ...hint, rescueCost })),
      shown: shown === null ? null : { ...shown, rescueCost },
    },
  }
}

function showNextHint(step: HintStep, tick: number, table: HintTable): HintStep {
  const [next, ...rest] = step.board.queued
  if (next === undefined || !isHintSlotFree(step.board, tick, table)) return step
  return {
    board: { queued: rest, shown: { ...next, shownTick: tick }, lastShownTick: tick },
    seen: [...step.seen, next.id],
  }
}

function isHintSlotFree(board: HintBoard, tick: number, table: HintTable): boolean {
  if (board.shown !== null) return false
  return board.lastShownTick === null || tick - board.lastShownTick >= table.minTicksBetweenHints
}

export function hintDefOf(table: HintTable, id: string): HintDef {
  const hint = table.hints.find((candidate) => candidate.id === id)
  if (hint === undefined) throw new Error(`the hint table has no ${id}`)
  return hint
}
