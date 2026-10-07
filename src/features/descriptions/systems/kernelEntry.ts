/**
 * How the side table names a kernel buyable (#164: all flavour lives in this slice, keyed by the
 * kernel's own item ref; no kernel data field is written). One entry per ref, matched by its exact
 * id, so no entry of this slice can overlap another slice's.
 */
import type { TrackKind } from '../../../systems/economy/trackKind'
import { majorOf, stepOfMajor } from '../../../systems/economy/upgradeSteps'
import type { Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { stepLevelText } from '../../../systems/views/stepLevelText'
import { hasNoNextLevel, type DescribedStatLineSpec } from './describedLineSpec'

export interface DescribedEntry extends ItemDescriptionEntry {
  statLines: readonly DescribedStatLineSpec[]
}

/**
 * How a two-tier item climbs (#181): the step one buy reaches from a stored step, and the step of
 * the next major; null where the item has none ahead.
 */
export interface StepLadder {
  nextStepOf(step: number): number | null
  nextMajorStepOf(step: number): number | null
}

/** An upgrade track: every buy is one step, and there is always a next major. */
export const TRACK_STEPS: StepLadder = {
  nextStepOf: (step) => step + 1,
  nextMajorStepOf: (step) => stepOfMajor(majorOf(step) + 1),
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

/** A two-tier figure (#181) read at the stored step, a buy on, and at the next major. */
export function steppedLine(
  label: string,
  kind: TrackKind,
  value: (step: number) => number | Money,
  steps: StepLadder = TRACK_STEPS,
): DescribedStatLineSpec {
  return {
    label,
    kind,
    value: (_ref, ctx) => value(ctx.level),
    nextLevel: (_ref, ctx) => steps.nextStepOf(ctx.level),
    nextMajorLevel: (_ref, ctx) => steps.nextMajorStepOf(ctx.level),
  }
}

/** The stored step as the Upgrade bay prints it, "13 · 4/9", and where one buy takes it. */
export function stepLevelLine(steps: StepLadder = TRACK_STEPS): DescribedStatLineSpec {
  return {
    label: 'Level',
    kind: 'linearInt',
    value: (_ref, ctx) => ctx.level,
    nextLevel: (_ref, ctx) => steps.nextStepOf(ctx.level),
    textOf: stepLevelText,
  }
}
