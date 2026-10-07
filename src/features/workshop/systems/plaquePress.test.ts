import { describe, expect, it } from 'vitest'
import { plaquePressOf, type PlaquePointer } from './plaquePress'

const TOUCH_ON_CLOSED_CARD: PlaquePointer = {
  isTouch: true,
  isCardOpen: false,
  hasCard: true,
  isBuyOpen: true,
}

describe("workshop: a press on a plaque's Buy", () => {
  it('opens a closed card on the first touch and buys nothing', () => {
    expect(plaquePressOf(TOUCH_ON_CLOSED_CARD)).toBe('open_card')
  })

  it('buys and holds on a touch on the open card', () => {
    expect(plaquePressOf({ ...TOUCH_ON_CLOSED_CARD, isCardOpen: true })).toBe('buy_and_hold')
  })

  it('buys and holds on a mouse press whether or not the card is open', () => {
    expect(plaquePressOf({ ...TOUCH_ON_CLOSED_CARD, isTouch: false })).toBe('buy_and_hold')
  })

  it('buys and holds on the first touch while no describer draws a card', () => {
    expect(plaquePressOf({ ...TOUCH_ON_CLOSED_CARD, hasCard: false })).toBe('buy_and_hold')
  })

  it('never buys while the Buy is refused, only opens the card', () => {
    const refused = { ...TOUCH_ON_CLOSED_CARD, isTouch: false, isCardOpen: true, isBuyOpen: false }
    expect(plaquePressOf(refused)).toBe('open_card')
  })
})
