/**
 * How far the run got, for the progress markers on `memory_sample` (#121, logging strategy
 * section 2): the deepest tile reached, tiles destroyed, units collected and money earned, folded
 * as each event arrives. It counts the `tile_destroyed` and `resource_collected` lines the live
 * game writes; those are `detail` events, which are on in every run that logs `perf` samples.
 * Money earned is what the summary counts as earned: sales and refined batches.
 */
import { add, fromCanonical, toCanonical, ZERO_MONEY, type Money } from '../systems/money'
import type { RunEventName } from './eventNames'
import type { RunEventSink } from './eventSink'
import type { RunEvent } from './runEvent'

export interface RunProgress {
  maxDepthTiles: number
  tilesDestroyed: number
  mineralsCollected: number
  /** A canonical string (#5). */
  moneyTotal: string
}

export interface RunProgressSink extends RunEventSink {
  progress(): RunProgress
}

interface ProgressTally {
  maxDepthTiles: number
  tilesDestroyed: number
  mineralsCollected: number
  moneyEarned: Money
}

type ProgressFold<N extends RunEventName> = (tally: ProgressTally, event: RunEvent<N>) => void

const PROGRESS_FOLDS: { readonly [N in RunEventName]?: ProgressFold<N> } = {
  tile_destroyed: (tally) => {
    tally.tilesDestroyed += 1
  },
  resource_collected: (tally, { data }) => {
    tally.mineralsCollected += data.amount
  },
  resource_sold: (tally, { data }) => {
    tally.moneyEarned = add(tally.moneyEarned, fromCanonical(data.value))
  },
  refine_collected: (tally, { data }) => {
    tally.moneyEarned = add(tally.moneyEarned, fromCanonical(data.value))
  },
}

export function createRunProgressSink(): RunProgressSink {
  const tally: ProgressTally = {
    maxDepthTiles: 0,
    tilesDestroyed: 0,
    mineralsCollected: 0,
    moneyEarned: ZERO_MONEY,
  }
  return {
    append: (event) => foldProgress(tally, event),
    appendCommand: () => undefined,
    progress: () => progressOf(tally),
  }
}

function foldProgress(tally: ProgressTally, event: RunEvent): void {
  tally.maxDepthTiles = Math.max(tally.maxDepthTiles, event.depthTiles)
  PROGRESS_FOLDS[event.event]?.(tally, event as never)
}

function progressOf(tally: ProgressTally): RunProgress {
  return {
    maxDepthTiles: tally.maxDepthTiles,
    tilesDestroyed: tally.tilesDestroyed,
    mineralsCollected: tally.mineralsCollected,
    moneyTotal: toCanonical(tally.moneyEarned),
  }
}
