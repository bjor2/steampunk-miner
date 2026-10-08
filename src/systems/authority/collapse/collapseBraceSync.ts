/**
 * Braces on collapsing blocks (ticket 331, the TD ruling on #285 section 2, under the GD lock):
 * once the registered providers' claims are folded (`registries/collapseBraces.ts`), each
 * collapsing entry's `isBraced` bit is brought in line with them, in block order.
 *
 * - Not braced to braced: the bit is set and `CollapseBraced {block, by}` says so. The entry then
 *   holds in its warning past its refill tick (`collapseTick.ts` skips it).
 * - Braced to not braced: the bit is cleared and the block is checked again as at its refill
 *   (`isCollapseHeld`). One that no longer holds is cancelled; one that does warns afresh from
 *   this tick (`CollapseWarned`, a forced one reporting as `forcedWeaknessOf`), so it refills 60
 *   ticks later and never at once.
 *
 * A brace never keeps a warning alive: the collapse watch still cancels an unforced braced block
 * relined or left beyond 16 m, and a forced (#313) block, always held, waits the brace out.
 *
 * It runs once per authority tick at three points, never per substep: at the head of the collapse
 * tick, at the end of the collapse watch after every accepted command, and after the slices' clock
 * steps, so a brace a slice ends on tick t is seen on tick t. A refill already under way is never
 * braced. With nothing collapsing it reads no registry and does nothing.
 */
import type { CollapseBrace } from '../../registries/collapseBraces'
import { bracesAt } from '../../registries/collapseBraces'
import type { PlanetParams } from '../../world/planetParams'
import { weaknessOfBlock, type BlockWeakness } from '../../world/collapseWeakness'
import { withCollapse, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import type { TickOutcome } from '../combat/combatTick'
import type { DomainEvent } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import {
  blockOfEntry,
  refillTickOf,
  withCollapsingBlock,
  type CollapsingBlock,
} from './collapseState'
import { cancelCollapse, forcedWeaknessOf, isCollapseHeld } from './collapseWatch'

/** Where the sync runs in a tick: before the collapse step moves blocks, or after it. */
export type BraceSyncPoint = 'beforeCollapseStep' | 'afterCollapseStep'

/** Every collapsing entry's brace brought in line with the claims at `tick`. */
export function syncCollapseBraces(
  state: AuthorityState,
  tick: number,
  point: BraceSyncPoint,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null || state.collapse.blocks.length === 0) return unchanged(state)
  const braces = bracesAt(state, tick)
  return chainEffects(
    state,
    state.collapse.blocks.map(
      (entry) => (current: AuthorityState) =>
        syncEntryBrace(current, params, entry, braces.get(entry.block), tick, point),
    ),
  )
}

/** The same on the authority clock, its events stamped with the tick. */
export function syncCollapseBracesAt(
  state: AuthorityState,
  tick: number,
  point: BraceSyncPoint,
): TickOutcome {
  const synced = syncCollapseBraces(state, tick, point)
  return {
    state: synced.state,
    events: synced.events.map((body): DomainEvent => ({ tick, ...body })),
  }
}

function syncEntryBrace(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
  brace: CollapseBrace | undefined,
  tick: number,
  point: BraceSyncPoint,
): RuleEffect {
  if (brace !== undefined && canBraceStart(entry, tick, point))
    return braceEntry(state, entry, brace)
  if (brace === undefined && entry.isBraced === true) return endBrace(state, params, entry, tick)
  return unchanged(state)
}

/**
 * Not braced yet, and its refill not begun: before the collapse step a block may still be braced
 * on its refill tick, after it only before.
 */
function canBraceStart(entry: CollapsingBlock, tick: number, point: BraceSyncPoint): boolean {
  if (entry.isBraced === true) return false
  const refillTick = refillTickOf(entry)
  return point === 'beforeCollapseStep' ? tick <= refillTick : tick < refillTick
}

function braceEntry(
  state: AuthorityState,
  entry: CollapsingBlock,
  brace: CollapseBrace,
): RuleEffect {
  const braced: CollapsingBlock = { ...entry, isBraced: true }
  return {
    state: withCollapse(state, withCollapsingBlock(state.collapse, braced)),
    events: [{ type: 'CollapseBraced', block: entry.block, by: brace.by }],
  }
}

function endBrace(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
  tick: number,
): RuleEffect {
  const { isBraced: _ended, ...unbraced } = entry
  if (!isCollapseHeld(state, params, unbraced)) return cancelCollapse(state, entry.block)
  return warnAfresh(state, params, { ...unbraced, startTick: tick })
}

/** The block's warning restarted from its new `startTick`, said as a new warning says it. */
function warnAfresh(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
): RuleEffect {
  return {
    state: withCollapse(state, withCollapsingBlock(state.collapse, entry)),
    events: [
      { type: 'CollapseWarned', block: entry.block, ...weaknessOfEntry(state, params, entry) },
    ],
  }
}

/** A held unforced block is weak; a forced one reports as the bore's warning did. */
function weaknessOfEntry(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
): BlockWeakness {
  const block = blockOfEntry(entry)
  const weakness = entry.isForced ? null : weaknessOfBlock(state.world, params, block)
  return weakness ?? forcedWeaknessOf(state, params, block)
}
