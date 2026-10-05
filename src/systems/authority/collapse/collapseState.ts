/**
 * The collapse part of authority state (decision #43 Authority and multiplayer): the blocks now
 * warning or refilling, each `{block, startTick}`, kept in processing order (`chunkKey`, then block
 * index). It is authority-only state, part of the snapshot and the checkpoint, so a replay or a
 * join fires every collapse on the same tick. Weakness itself is never stored: it is read from the
 * ground (`collapseWeakness`).
 *
 * A block warns for `COLLAPSE_WARN_TICKS` from `startTick`, then refills one step a tick for
 * `COLLAPSE_FILL_TICKS`, then leaves the list. `debug.forceCollapse` marks a block forced: it runs
 * to its refill whatever its lining and wherever the vehicles are.
 */
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { blockOfId, compareBlocks, type CollapseBlock } from '../../world/collapseBlock'

export interface CollapsingBlock {
  /** `cx,cy#index` (`collapseBlock`). */
  block: string
  startTick: number
  isForced: boolean
}

export interface CollapseState {
  blocks: readonly CollapsingBlock[]
}

export const NO_COLLAPSE: CollapseState = { blocks: [] }

export function refillTickOf(entry: CollapsingBlock): number {
  return entry.startTick + COLLAPSE_WARN_TICKS
}

/** The first tick after the refill's last step. */
export function settledTickOf(entry: CollapsingBlock): number {
  return refillTickOf(entry) + COLLAPSE_FILL_TICKS
}

/** Still telegraphing at `tick`: the warning can still be cancelled. */
export function isWarningAt(entry: CollapsingBlock, tick: number): boolean {
  return tick < refillTickOf(entry)
}

/** The earliest tick after `afterTick` at which some block warns into a refill or refills. */
export function nextCollapseTick(collapse: CollapseState, afterTick: number): number | null {
  const ticks = collapse.blocks.map((entry) => Math.max(afterTick + 1, refillTickOf(entry)))
  return ticks.length === 0 ? null : Math.min(...ticks)
}

export function blockOfEntry(entry: CollapsingBlock): CollapseBlock {
  return blockOfId(entry.block) as CollapseBlock
}

export function entryOfBlock(collapse: CollapseState, id: string): CollapsingBlock | null {
  return collapse.blocks.find((entry) => entry.block === id) ?? null
}

/** The list with `entry` added or replaced, still in processing order. */
export function withCollapsingBlock(
  collapse: CollapseState,
  entry: CollapsingBlock,
): CollapseState {
  const others = collapse.blocks.filter((kept) => kept.block !== entry.block)
  return {
    blocks: [...others, entry].sort((a, b) => compareBlocks(blockOfEntry(a), blockOfEntry(b))),
  }
}

export function withoutCollapsingBlock(collapse: CollapseState, id: string): CollapseState {
  return { blocks: collapse.blocks.filter((entry) => entry.block !== id) }
}
