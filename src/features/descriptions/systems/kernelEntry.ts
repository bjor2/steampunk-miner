/**
 * How the side table names a kernel buyable (#164: all flavour lives in this slice, keyed by the
 * kernel's own item ref; no kernel data field is written). One entry per ref, matched by its exact
 * id, so no entry of this slice can overlap another slice's.
 */
import type { TrackKind } from '../../../systems/economy/trackKind'
import type { Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from './describedLineSpec'

export interface DescribedEntry extends ItemDescriptionEntry {
  statLines: readonly DescribedStatLineSpec[]
}

export function kernelEntryOf(
  item: ItemRef,
  flavour: string,
  statLines: readonly DescribedStatLineSpec[],
): DescribedEntry {
  return {
    id: `descriptions.${item.kind}.${item.id}`,
    matches: { kind: item.kind, id: item.id },
    flavour,
    statLines,
  }
}

/** A figure that does not change when the item is bought again: no next value, no change. */
export function fixedLine(
  label: string,
  kind: TrackKind,
  value: (ctx: ItemCtx) => number | Money,
): DescribedStatLineSpec {
  return { label, kind, value: (_ref, ctx) => value(ctx), nextLevel: hasNoNextLevel }
}

/** A figure read at the owned level, with the next one a level on, up to an optional top level. */
export function levelledLine(
  label: string,
  kind: TrackKind,
  value: (level: number, ctx: ItemCtx) => number | Money,
  topLevel?: () => number,
): DescribedStatLineSpec {
  return {
    label,
    kind,
    value: (_ref, ctx) => value(ctx.level, ctx),
    nextLevel: (_ref, ctx) => nextLevelBelow(ctx.level, topLevel),
  }
}

function nextLevelBelow(level: number, topLevel: (() => number) | undefined): number | null {
  if (topLevel !== undefined && level >= topLevel()) return null
  return level + 1
}
