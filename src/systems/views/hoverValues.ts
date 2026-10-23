/**
 * What a desktop hover says (spec #678, ticket 768; the GD lock of 23 Oct and VS's input on it):
 * a figure's full value in the formatter's long mode, a balance rounded down and a price up as
 * their chips are, and a tool cell's name, its item's hover line (the #680 line a phone's long
 * press shows) and its charges in full. A reading that is no amount (a count over a count) keeps
 * its own text. Pure.
 */
import { formatAmountLong, formatPriceLong } from '../displayAmount'
import { fromCanonical, isMoneyText } from '../money'
import type { ToolFace } from '../input/toolSlots'
import type { StripNumber } from './hudStrip'

/** A balance, a count or a reading's exact text in the long mode. */
export function longAmountOfExact(exact: string): string {
  return isMoneyText(exact) ? formatAmountLong(fromCanonical(exact)) : exact
}

/** A price's exact text in the long mode, rounded up as its chip is. */
export function longPriceOfExact(exact: string): string {
  return isMoneyText(exact) ? formatPriceLong(fromCanonical(exact)) : exact
}

/** The strip's one number in full (ticket 768): the money rounded down, the depth in metres. */
export function stripNumberLongTextOf(number: StripNumber): string {
  const long = longAmountOfExact(number.exact)
  return number.kind === 'money' ? long : `${long} m`
}

/** The cell's hover: the tool's name, its hover line, then its charges in full when it has any. */
export function toolHoverLinesOf(face: ToolFace, hoverLine: string | null): string[] {
  return [face.name, hoverLine, chargesLineOf(face)].filter(isShownLine)
}

function chargesLineOf({ chargesLeft, chargesMax }: ToolFace): string | null {
  if (chargesMax === 0) return null
  return `${formatAmountLong(chargesLeft)} of ${formatAmountLong(chargesMax)} charges`
}

function isShownLine(line: string | null): line is string {
  return line !== null && line !== ''
}
