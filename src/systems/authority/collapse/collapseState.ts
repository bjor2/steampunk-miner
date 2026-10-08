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
 *
 * A braced block (ticket 331, `collapseBraces`) stays in its warning past its refill tick and
 * never refills; when its brace ends it warns afresh from that tick (`collapseBraceSync.ts`).
 */
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { bracesAt, type CollapseBrace } from '../../registries/collapseBraces'
import { blockOfId, compareBlocks, type CollapseBlock } from '../../world/collapseBlock'
import type { AuthorityState } from '../authorityState'

export interface CollapsingBlock {
  /** `cx,cy#index` (`collapseBlock`). */
  block: string
  startTick: number
  isForced: boolean
  /**
   * Written only while some slice braces the block, absent otherwise, so a session with no brace
   * keeps its snapshot, save and digest. It remembers that a brace was on, which a claim read
   * later cannot: the fresh warning starts on the tick the brace was seen to end.
   */
  isBraced?: true
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

/** Still telegraphing at `tick`, as a braced block always is: the warning can still be cancelled. */
export function isWarningAt(entry: CollapsingBlock, tick: number): boolean {
  return entry.isBraced === true || tick < refillTickOf(entry)
}

/**
 * The earliest tick after `afterTick` at which some block warns into a refill or refills, or a
 * brace on one ends. A braced block names its brace's `untilTick`, the next tick when its claims
 * are gone, and nothing while its brace is open-ended, so a quiet clock never stops every tick.
 */
export function nextCollapseTick(state: AuthorityState, afterTick: number): number | null {
  const braces = bracesOfBracedEntries(state, afterTick)
  const ticks = state.collapse.blocks
    .map((entry) => dueTickOf(entry, braces.get(entry.block), afterTick))
    .filter((tick): tick is number => tick !== null)
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** Reads the braces only when some entry is braced, so an unbraced session reads no registry. */
function bracesOfBracedEntries(
  state: AuthorityState,
  tick: number,
): ReadonlyMap<string, CollapseBrace> {
  const isAnyBraced = state.collapse.blocks.some((entry) => entry.isBraced === true)
  return isAnyBraced ? bracesAt(state, tick) : NO_BRACES
}

function dueTickOf(
  entry: CollapsingBlock,
  brace: CollapseBrace | undefined,
  afterTick: number,
): number | null {
  if (entry.isBraced !== true) return Math.max(afterTick + 1, refillTickOf(entry))
  if (brace === undefined) return afterTick + 1
  return brace.untilTick === null ? null : Math.max(afterTick + 1, brace.untilTick)
}

const NO_BRACES: ReadonlyMap<string, CollapseBrace> = new Map()

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
