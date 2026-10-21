import { describe, expect, it } from 'vitest'
import { cardPressOf, revealedCardAfter } from './cardReveal'

// Tap-to-reveal (spec #678, ticket 686): on a phone the first tap shows a card's line and the
// second acts; a mouse or the keyboard has already shown it, so it acts at once.

describe('card reveal', () => {
  it("shows the line on a finger's first tap and acts on the second", () => {
    const first = cardPressOf(null, 'probe.drill', 'touch')
    expect(first).toBe('reveal')
    const revealed = revealedCardAfter(null, 'probe.drill', first)
    expect(revealed).toBe('probe.drill')
    expect(cardPressOf(revealed, 'probe.drill', 'touch')).toBe('act')
  })

  it('treats a pen like a finger', () => {
    expect(cardPressOf(null, 'probe.drill', 'pen')).toBe('reveal')
  })

  it('moves the reveal to another card instead of acting on it', () => {
    expect(cardPressOf('probe.drill', 'probe.hull', 'touch')).toBe('reveal')
    expect(revealedCardAfter('probe.drill', 'probe.hull', 'reveal')).toBe('probe.hull')
  })

  it('acts on the first mouse click, since hover already showed the line', () => {
    expect(cardPressOf(null, 'probe.drill', 'mouse')).toBe('act')
  })

  it('acts on Enter or Space, since focus already showed the line', () => {
    expect(cardPressOf(null, 'probe.drill', 'keyboard')).toBe('act')
  })

  it('leaves the shown line where it was after an action', () => {
    expect(revealedCardAfter('probe.drill', 'probe.drill', 'act')).toBe('probe.drill')
    expect(revealedCardAfter(null, 'probe.hull', 'act')).toBeNull()
  })
})
