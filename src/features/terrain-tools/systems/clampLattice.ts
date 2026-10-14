/**
 * What the lode clamp's lattice shows (G&V feel line 3 on #285, ticket 285): the brass struts go
 * over exactly the blocks the player's field braces now, and each one's warning countdown stands
 * still at what it had left when the brace caught it. When the brace ends the kernel warns the
 * block afresh, so its countdown reads the full 60 ticks again on that tick (`collapseBraceSync`).
 * The frozen value is the clamp's (`frozenTicksLeftOf`), the one the collapse telegraph draws.
 * Presentation only: read from the authority
 * state, never written back; the scene draws it (the magnet fields, #286).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { bracedBlocksOf, frozenTicksLeftOf } from './lodeClamp'
import { terrainToolsOf } from './terrainSection'

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
