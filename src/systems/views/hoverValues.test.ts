import { describe, expect, it } from 'vitest'
import type { ToolFace } from '../input/toolSlots'
import {
  longAmountOfExact,
  longPriceOfExact,
  stripNumberLongTextOf,
  toolHoverLinesOf,
} from './hoverValues'

// What a desktop hover says (spec #678, ticket 768): a figure's full value in the formatter's long
// mode, rounded as its chip is, and a tool cell's name, hover line and charges in full.

const FACE: ToolFace = {
  iconId: 'icon-probe',
  name: 'Steam shield',
  cooldownPercent: 0,
  chargesLeft: 0,
  chargesMax: 0,
  isOn: false,
  isActing: false,
}

describe('hover values', () => {
  it('shows a balance in full, rounded down, and leaves a reading that is no amount as it is', () => {
    expect(longAmountOfExact('1.2345678912345e+15')).toBe('1.23456789123e15')
    expect(longAmountOfExact('1234.5678')).toBe('1,234.567')
    expect(longAmountOfExact('3/9')).toBe('3/9')
  })

  it('shows a price in full, rounded up as its chip is', () => {
    expect(longPriceOfExact('1234.5671')).toBe('1,234.568')
    expect(longPriceOfExact('1.2345678912341e+15')).toBe('1.23456789124e15')
  })

  it('shows the strip’s money in full, and its depth in whole metres', () => {
    expect(stripNumberLongTextOf({ kind: 'money', text: '12.3k', exact: '12345.678' })).toBe(
      '12,345.678',
    )
    expect(stripNumberLongTextOf({ kind: 'depth', text: '12.3 km', exact: '12345' })).toBe(
      '12,345 m',
    )
  })
})

describe('tool hover lines', () => {
  it('names the tool, then gives its hover line', () => {
    expect(toolHoverLinesOf(FACE, 'A brass bell of steam.')).toEqual([
      'Steam shield',
      'A brass bell of steam.',
    ])
  })

  it('adds the charges in full to a tool that holds them, past the badge’s six characters', () => {
    const charged = { ...FACE, chargesLeft: 123_456, chargesMax: 200_000 }
    expect(toolHoverLinesOf(charged, null)).toEqual(['Steam shield', '123,456 of 200,000 charges'])
  })

  it('shows the name alone for a tool with no item line and no charges', () => {
    expect(toolHoverLinesOf(FACE, null)).toEqual(['Steam shield'])
    expect(toolHoverLinesOf(FACE, '')).toEqual(['Steam shield'])
  })
})
