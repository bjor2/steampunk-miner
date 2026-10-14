/**
 * Where still foam carries a pocket (ticket 373): the collapse blocks stabiliser foam braces, as
 * the kernel's `collapseBraces` fold names them (`terrain-tools.stabiliser-foam`, a 4 m block per
 * set cell, ticket 381), so this slice reads foam without importing terrain-tools. A spray's blocks
 * are those it braced or held longer than the state before it did; an enemy is on still foam when
 * the block holding it is one of its pocket's.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { bracesAt, type CollapseBrace } from '../../../systems/registries/collapseBraces'
import { blockContaining, blockIdOf } from '../../../systems/world/collapseBlock'
import type { SlowPocket } from './pocketSection'

/** The foam brace's provider id, named by string so this slice imports no lane. */
const FOAM_BRACE_ID = 'terrain-tools.stabiliser-foam'

export function isOnStilledFoam(pocket: SlowPocket, enemy: Enemy): boolean {
  const blocks = pocket.stilledBlocks
  return blocks !== undefined && blocks.includes(blockIdOf(blockContaining(enemyMmOf(enemy))))
}

/** The blocks foam braces at `tick` in `after` that `before` did not, or held for less long. */
export function freshlyFoamedBlocksOf(
  before: AuthorityState,
  after: AuthorityState,
  tick: number,
): string[] {
  const earlier = foamBracesOf(before, tick)
  return [...foamBracesOf(after, tick)]
    .filter(([block, brace]) => isLongerHeld(brace, earlier.get(block)))
    .map(([block]) => block)
    .sort()
}

/** The sorted union of two block lists. */
export function joinedBlocksOf(
  held: readonly string[] | undefined,
  added: readonly string[],
): string[] {
  return [...new Set([...(held ?? []), ...added])].sort()
}

function foamBracesOf(state: AuthorityState, tick: number): Map<string, CollapseBrace> {
  const braces = [...bracesAt(state, tick)].filter(([, brace]) => brace.by.includes(FOAM_BRACE_ID))
  return new Map(braces)
}

/** A block new to the foam, or one whose brace now ends later. */
function isLongerHeld(brace: CollapseBrace, earlier: CollapseBrace | undefined): boolean {
  if (earlier === undefined) return true
  return endOf(brace) > endOf(earlier)
}

function endOf(brace: CollapseBrace): number {
  return brace.untilTick ?? Number.MAX_SAFE_INTEGER
}

function enemyMmOf(enemy: Enemy): { xMm: number; yMm: number } {
  return { xMm: enemy.x, yMm: enemy.y }
}
