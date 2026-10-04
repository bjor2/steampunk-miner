import { describe, expect, it } from 'vitest'
import { throttleFromKeys } from './throttleFromKeys'

describe('throttle from keys', () => {
  it('is zero with nothing held', () => {
    expect(throttleFromKeys(new Set())).toBe(0)
  })

  it('goes right on D or the right arrow', () => {
    expect(throttleFromKeys(new Set(['KeyD']))).toBe(1)
    expect(throttleFromKeys(new Set(['ArrowRight']))).toBe(1)
  })

  it('goes left on A or the left arrow', () => {
    expect(throttleFromKeys(new Set(['KeyA']))).toBe(-1)
    expect(throttleFromKeys(new Set(['ArrowLeft']))).toBe(-1)
  })

  it('cancels out when both directions are held', () => {
    expect(throttleFromKeys(new Set(['KeyA', 'KeyD']))).toBe(0)
  })

  it('ignores keys that do not steer', () => {
    expect(throttleFromKeys(new Set(['Space']))).toBe(0)
  })
})
