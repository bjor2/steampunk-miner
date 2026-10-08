/**
 * The `collapseBraces` seam (ticket 331, the TD ruling on #285 sections 1-2, locked with both
 * Scalers): a slice holds a warning collapse block up without keeping it alive. A braced block
 * stays in its warning and never refills; when the last claim on it ends it warns afresh for 60
 * ticks (`collapseBraceSync.ts`). A brace is a separate gate from `isCollapseHeld`, which stays the
 * cancel test.
 *
 * - **Derived, never stored.** A provider answers from its own saved section at `tick`; the kernel
 *   keeps no copy of the claims, only one `isBraced` bit per collapsing entry.
 * - **No unlock gate here.** Each provider answers only while its item is owned or its row has
 *   `FeatureUnlocked` (Horizontal Scaler).
 * - **Order-independent fold.** Per block, `by` is the sorted unique provider ids in code-unit
 *   order and `untilTick` is null if any claim's is, else the latest; a claim whose `untilTick`
 *   has come holds no more. Registration order never changes the answer.
 *
 * With nothing registered nothing is braced.
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineRegistry, entriesOf } from './seal'

export interface CollapseBraceClaim {
  /** `cx,cy#index` (`collapseBlock.blockIdOf`). */
  block: string
  /** First tick the claim no longer holds; null = until the provider's own section changes. */
  untilTick: number | null
}

export interface CollapseBraceProvider {
  /** `<slice>.<name>`; also the reason `CollapseBraced` names. */
  id: string
  /** Blocks braced at `tick`. Pure in (state, tick), read from the provider's own section. */
  bracesAt(state: AuthorityState, tick: number): readonly CollapseBraceClaim[]
}

/** Every claim on one block, folded. */
export interface CollapseBrace {
  /** The providers bracing it, sorted unique in code-unit order. */
  by: readonly string[]
  /** Null while any claim is open-ended, else the latest claim's end. */
  untilTick: number | null
}

export const COLLAPSE_BRACE_REGISTRY = defineRegistry<CollapseBraceProvider>('collapseBraces')

/** The blocks braced at `tick`, by block id, every provider's claims folded. */
export function bracesAt(state: AuthorityState, tick: number): ReadonlyMap<string, CollapseBrace> {
  const braces = new Map<string, CollapseBrace>()
  for (const provider of entriesOf(COLLAPSE_BRACE_REGISTRY)) {
    for (const claim of provider.bracesAt(state, tick)) {
      if (isClaimHeldAt(claim, tick)) foldClaimInto(braces, provider.id, claim)
    }
  }
  return braces
}

function isClaimHeldAt(claim: CollapseBraceClaim, tick: number): boolean {
  return claim.untilTick === null || tick < claim.untilTick
}

function foldClaimInto(
  braces: Map<string, CollapseBrace>,
  providerId: string,
  claim: CollapseBraceClaim,
): void {
  const known = braces.get(claim.block)
  const brace = known === undefined ? braceOf(providerId, claim) : joined(known, providerId, claim)
  braces.set(claim.block, brace)
}

function braceOf(providerId: string, claim: CollapseBraceClaim): CollapseBrace {
  return { by: [providerId], untilTick: claim.untilTick }
}

function joined(
  known: CollapseBrace,
  providerId: string,
  claim: CollapseBraceClaim,
): CollapseBrace {
  return {
    by: withProviderId(known.by, providerId),
    untilTick: laterEndOf(known.untilTick, claim.untilTick),
  }
}

function withProviderId(by: readonly string[], providerId: string): readonly string[] {
  if (by.includes(providerId)) return by
  return [...by, providerId].sort(compareCodeUnits)
}

function laterEndOf(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : Math.max(a, b)
}

function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
