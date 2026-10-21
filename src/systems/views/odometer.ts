/**
 * The brass odometer (spec #678, ticket 684; docs/ui/design-system.md section 6): the shared
 * formatter's text drawn one drum cell per character, so a changed digit rolls in and the rest
 * stay still. A cell is keyed by its place from the right and its character: the ones place is
 * the same cell however long the number grows, and a new character in it is a new key, which
 * replays the roll. Pure; the component draws the cells.
 */

export interface OdometerCell {
  key: string
  char: string
  isDigit: boolean
}

const DIGIT = /\d/

export function odometerCellsOf(text: string): OdometerCell[] {
  const chars = [...text]
  return chars.map((char, index) => ({
    key: `${chars.length - 1 - index}:${char}`,
    char,
    isDigit: DIGIT.test(char),
  }))
}
