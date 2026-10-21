import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../money'
import { gainTextOf } from './gainText'

// Gain text (spec #678, ticket 687): the stat and its change, "+24% drill speed", never a table.

const gainOf = (before: string, after: string, stat: string) =>
  gainTextOf(fromCanonical(before), fromCanonical(after), stat)

describe('gain text', () => {
  it('names a rise as a signed share of the stat', () => {
    expect(gainOf('50', '62', 'drill speed')).toBe('+24% drill speed')
  })

  it('names a fall with its minus, as a shorter cooldown', () => {
    expect(gainOf('40', '35.2', 'cooldown')).toBe('-12% cooldown')
  })

  it('rounds the share toward zero, so a gain never reads larger than it is', () => {
    expect(gainOf('3', '4', 'hull')).toBe('+33.3% hull')
  })

  it('says the amount gained when the stat starts from nothing', () => {
    expect(gainOf('0', '3', 'charges')).toBe('+3 charges')
  })

  it('reads no change as plus nothing', () => {
    expect(gainOf('10', '10', 'top speed')).toBe('+0% top speed')
  })

  it('reads a share of a stat past the doubles exactly', () => {
    expect(gainOf('1e400', '1.5e400', 'drill speed')).toBe('+50% drill speed')
  })
})
