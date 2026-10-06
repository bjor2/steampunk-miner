import { describe, expect, it } from 'vitest'
import { hapticPulseMsOf } from './haptics'

describe('haptics (#173)', () => {
  it('ticks 10 ms on drill contact and pulses 30 ms when the hull takes damage', () => {
    expect(hapticPulseMsOf({ kind: 'drillContact' })).toBe(10)
    expect(hapticPulseMsOf({ kind: 'hit' })).toBe(30)
    expect(hapticPulseMsOf({ kind: 'destroyed' })).toBe(30)
  })

  it('stays still for every other cue', () => {
    expect(hapticPulseMsOf({ kind: 'pickup', tier: 3 })).toBeNull()
    expect(hapticPulseMsOf({ kind: 'dockClank' })).toBeNull()
  })
})
