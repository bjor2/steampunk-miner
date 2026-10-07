/**
 * One stat line of the card from its raw values (Vertical Scaler's line shape on #164): now, the
 * next value, the change and its share, and the cap headroom of a saturating line. Every figure is
 * computed in Money from the spec's raw kernel values and only then formatted, so nothing subtracts
 * formatted strings and nothing passes through a double. A stat reads as the screens read it
 * (`statReading`): cut to the formatter's three decimals, then `formatAmount`; shares go through
 * `formatPercent` from the exact values.
 *
 * A change too small for those three decimals (an engine line hundreds of levels up) reads
 * `<0.001`, never `0`: the card must show that the buy still adds something, the way
 * `formatPercent` prints `<0.01%`.
 */
import { formatAmount, formatPercent } from '../../../systems/displayAmount'
import {
  cmp,
  div,
  floorMilli,
  fromFiniteNumber,
  fromSafeInteger,
  isMoney,
  sub,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import type { ItemCtx, ItemRef, StatLine } from '../../../systems/registries/itemDescriber'
import type { DescribedStatLineSpec } from './describedLineSpec'

/** What the card prints for a change the three decimals would show as zero. */
export const TINY_CHANGE_TEXT = '<0.001'

const SHOWN_AS_ZERO = /^-?0$/

export function statLineOf(spec: DescribedStatLineSpec, ref: ItemRef, ctx: ItemCtx): StatLine {
  const now = valueAt(spec, ref, ctx, ctx.level)
  return {
    label: spec.label,
    kind: spec.kind,
    now: formatStat(now),
    ...changeFieldsOf(now, nextValueOf(spec, ref, ctx)),
    ...capFieldsOf(spec, ref, ctx, now),
  }
}

/** A raw stat as Money: counts exactly, fractional bounded stats (engine, fire rate) as decimals. */
export function moneyOf(value: number | Money): Money {
  if (isMoney(value)) return value
  return Number.isSafeInteger(value) ? fromSafeInteger(value) : fromFiniteNumber(value)
}

/** A stat as the screens show it: cut toward zero to three decimals, then `formatAmount`. */
export function formatStat(amount: Money): string {
  return formatAmount(floorMilli(amount))
}

function valueAt(spec: DescribedStatLineSpec, ref: ItemRef, ctx: ItemCtx, level: number): Money {
  return moneyOf(spec.value(ref, { ...ctx, level }))
}

function nextValueOf(spec: DescribedStatLineSpec, ref: ItemRef, ctx: ItemCtx): Money | null {
  const level = spec.nextLevel === undefined ? ctx.level + 1 : spec.nextLevel(ref, ctx)
  return level === null ? null : valueAt(spec, ref, ctx, level)
}

function changeFieldsOf(now: Money, next: Money | null): Partial<StatLine> {
  if (next === null) return {}
  const delta = sub(next, now)
  return { next: formatStat(next), delta: changeTextOf(delta), ...shareFieldsOf(delta, now) }
}

function shareFieldsOf(delta: Money, now: Money): Partial<StatLine> {
  if (cmp(now, ZERO_MONEY) === 0) return {}
  return { deltaPct: formatPercent(div(delta, now)) }
}

function changeTextOf(delta: Money): string {
  const text = formatStat(delta)
  if (!SHOWN_AS_ZERO.test(text) || cmp(delta, ZERO_MONEY) === 0) return text
  return cmp(delta, ZERO_MONEY) < 0 ? `-${TINY_CHANGE_TEXT}` : TINY_CHANGE_TEXT
}

function capFieldsOf(
  spec: DescribedStatLineSpec,
  ref: ItemRef,
  ctx: ItemCtx,
  now: Money,
): Partial<StatLine> {
  if (spec.cap === undefined) return {}
  const cap = moneyOf(spec.cap(ref, ctx))
  if (cmp(cap, ZERO_MONEY) === 0) return {}
  return { cap: { value: formatStat(cap), headroomPct: formatPercent(div(sub(cap, now), cap)) } }
}
