/**
 * What the lode clamp's lattice shows (G&V feel line 3 on #285, ticket 285): the brass struts go
 * over exactly the blocks the player's field braces now, and each one's warning countdown stands
 * still at what it had left when the brace caught it. When the brace ends the kernel warns the
 * block afresh, so its countdown reads the full 60 ticks again on that tick (`collapseBraceSync`).
 *
 * The kernel keeps only an `isBraced` bit per collapsing entry, so the tick a brace caught a block
 * is derived from the save: the later of the field's act and the block's warning, as the brace
 * sync runs on the act's tick and on every warning's. Presentation only: read from the authority
 * state, never written back; the scene draws it (the magnet fields, #286).
 */
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { CollapsingBlock } from '../../../systems/authority/collapse/collapseState'
import { bracedBlocksOf } from './lodeClamp'
import { terrainToolsOf, type ClampField } from './terrainSection'

/** One braced block under the lattice. */
export interface LatticeBlock {
  /** `cx,cy#index` (`collapseBlock.blockIdOf`). */
  block: string
  /** The warning ticks it had left when the brace caught it, held there while braced. */
  frozenTicksLeft: number
}

/** The blocks the player's field braces now, in the collapse list's order; none without one. */
export function clampLatticeOf(state: AuthorityState, playerId: string): LatticeBlock[] {
  const { clamp } = terrainToolsOf(state, playerId)
  if (clamp === undefined) return []
  const claimed = new Set(bracedBlocksOf(state, playerId))
  return state.collapse.blocks
    .filter((entry) => entry.isBraced === true && claimed.has(entry.block))
    .map((entry) => ({ block: entry.block, frozenTicksLeft: frozenTicksLeftOf(entry, clamp) }))
}

function frozenTicksLeftOf(entry: CollapsingBlock, clamp: ClampField): number {
  const caughtTick = Math.max(clamp.startTick, entry.startTick)
  const warned = Math.min(COLLAPSE_WARN_TICKS, caughtTick - entry.startTick)
  return COLLAPSE_WARN_TICKS - warned
}
