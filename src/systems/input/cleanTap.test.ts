import { describe, expect, it } from 'vitest'
import { isCleanTapAt, pressAfterMove, pressOnLanding } from './cleanTap'

const at = (x: number, y: number, pointerId = 1) => ({ pointerId, x, y })

describe('clean tap (#500 VS gesture priority)', () => {
  it('is a tap when one finger lands and lifts in place inside the box', () => {
    const press = pressOnLanding(null, at(10, 10), true)
    expect(isCleanTapAt(press, at(12, 11), true)).toBe(true)
  })

  it('is no tap once the finger drags past the slop, even back to where it landed', () => {
    const press = pressAfterMove(pressOnLanding(null, at(10, 10), true), at(40, 10))
    expect(isCleanTapAt(pressAfterMove(press, at(10, 10)), at(10, 10), true)).toBe(false)
  })

  it('is no tap when a second finger lands meanwhile (a pinch)', () => {
    const press = pressOnLanding(null, at(10, 10), true)
    const spoiled = pressOnLanding(press, at(100, 100, 2), false)
    expect(isCleanTapAt(spoiled, at(10, 10), true)).toBe(false)
  })

  it('is no tap when the finger is released outside the box', () => {
    expect(isCleanTapAt(pressOnLanding(null, at(10, 10), true), at(10, 10), false)).toBe(false)
  })

  it('ignores another pointer moving, and a lift of a pointer it never pressed', () => {
    const press = pressOnLanding(null, at(10, 10), true)
    expect(pressAfterMove(press, at(300, 300, 2))).toBe(press)
    expect(isCleanTapAt(press, at(10, 10, 2), true)).toBe(false)
  })
})
